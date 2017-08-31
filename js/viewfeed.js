var _active_article_id = 0;

var vgroup_last_feed = false;
var post_under_pointer = false;

var last_requested_article = false;

var catchup_id_batch = [];
var catchup_timeout_id = false;

var cids_requested = [];
var loaded_article_ids = [];
var _last_headlines_update = 0;
var _headlines_scroll_offset = 0;
var current_first_id = 0;
var last_search_query;

var _catchup_request_sent = false;

var has_storage = 'sessionStorage' in window && window['sessionStorage'] !== null;

function headlines_callback2(transport, offset, background, infscroll_req) {
	handle_rpc_json(transport);

	console.log("headlines_callback2 [offset=" + offset + "] B:" + background + " I:" + infscroll_req);

	var is_cat = false;
	var feed_id = false;

	var reply = false;

	try {
		reply = JSON.parse(transport.responseText);
	} catch (e) {
		console.error(e);
	}

	if (reply) {

		is_cat = reply['headlines']['is_cat'];
		feed_id = reply['headlines']['id'];
		last_search_query = reply['headlines']['search_query'];

		if (background) {
			var content = reply['headlines']['content'];

			content = content + "<div id='headlines-spacer'></div>";
			return;
		}

		if (feed_id != -7 && (feed_id != getActiveFeedId() || is_cat != activeFeedIsCat()))
			return;

		/* dijit.getEnclosingWidget(
			document.forms["main_toolbar_form"].update).attr('disabled',
				is_cat || feed_id <= 0); */

		try {
			if (infscroll_req == false) {
				$("headlines-frame").scrollTop = 0;

				$("floatingTitle").style.visibility = "hidden";
				$("floatingTitle").setAttribute("data-article-id", 0);
				$("floatingTitle").innerHTML = "";
			}
		} catch (e) { };

		$("headlines-frame").removeClassName("cdm");
		$("headlines-frame").removeClassName("normal");

		$("headlines-frame").addClassName(isCdmMode() ? "cdm" : "normal");

		var headlines_count = reply['headlines-info']['count'];

		vgroup_last_feed = reply['headlines-info']['vgroup_last_feed'];

		if (parseInt(headlines_count) < 30) {
			_infscroll_disable = 1;
		} else {
			_infscroll_disable = 0;
		}

		current_first_id = reply['headlines']['first_id'];
		var counters = reply['counters'];
		var articles = reply['articles'];
		//var runtime_info = reply['runtime-info'];

		if (infscroll_req == false) {
			loaded_article_ids = [];

			dojo.html.set($("headlines-toolbar"),
					reply['headlines']['toolbar'],
					{parseContent: true});

			/*dojo.html.set($("headlines-frame"),
				reply['headlines']['content'],
				{parseContent: true});

			$$("#headlines-frame div[id*='RROW']").each(function(row) {
				loaded_article_ids.push(row.id);
			});*/

			$("headlines-frame").innerHTML = '';

			var tmp = new Element("div");
			tmp.innerHTML = reply['headlines']['content'];
			dojo.parser.parse(tmp);

			while (tmp.hasChildNodes()) {
				var row = tmp.removeChild(tmp.firstChild);

				if (loaded_article_ids.indexOf(row.id) == -1 || row.hasClassName("cdmFeedTitle")) {
					dijit.byId("headlines-frame").domNode.appendChild(row);

					loaded_article_ids.push(row.id);
				}
			}

			var hsp = $("headlines-spacer");
			if (!hsp) hsp = new Element("DIV", {"id": "headlines-spacer"});
			dijit.byId('headlines-frame').domNode.appendChild(hsp);

			initHeadlinesMenu();

			if (_infscroll_disable)
				hsp.innerHTML = "<a href='#' onclick='openNextUnreadFeed()'>" +
					__("Click to open next unread feed.") + "</a>";

			if (_search_query) {
				$("feed_title").innerHTML += "<span id='cancel_search'>" +
					" (<a href='#' onclick='cancelSearch()'>" + __("Cancel search") + "</a>)" +
					"</span>";
			}

		} else {

			if (headlines_count > 0 && feed_id == getActiveFeedId() && is_cat == activeFeedIsCat()) {
				console.log("adding some more headlines: " + headlines_count);

				var c = dijit.byId("headlines-frame");
				var ids = getSelectedArticleIds2();

				var hsp = $("headlines-spacer");

				if (hsp)
					c.domNode.removeChild(hsp);

				var tmp = new Element("div");
				tmp.innerHTML = reply['headlines']['content'];
				dojo.parser.parse(tmp);

				while (tmp.hasChildNodes()) {
					var row = tmp.removeChild(tmp.firstChild);

					if (loaded_article_ids.indexOf(row.id) == -1 || row.hasClassName("cdmFeedTitle")) {
						dijit.byId("headlines-frame").domNode.appendChild(row);

						loaded_article_ids.push(row.id);
					}
				}

				if (!hsp) hsp = new Element("DIV", {"id": "headlines-spacer"});
				c.domNode.appendChild(hsp);

				if (headlines_count < 30) _infscroll_disable = true;

				console.log("restore selected ids: " + ids);

				for (var i = 0; i < ids.length; i++) {
					markHeadline(ids[i]);
				}

				initHeadlinesMenu();

				if (_infscroll_disable) {
					hsp.innerHTML = "<a href='#' onclick='openNextUnreadFeed()'>" +
					__("Click to open next unread feed.") + "</a>";
				}

			} else {
				console.log("no new headlines received");

				var first_id_changed = reply['headlines']['first_id_changed'];
				console.log("first id changed:" + first_id_changed);

				var hsp = $("headlines-spacer");

				if (hsp) {
					if (first_id_changed) {
						hsp.innerHTML = "<a href='#' onclick='viewCurrentFeed()'>" +
						__("New articles found, reload feed to continue.") + "</a>";
					} else {
						hsp.innerHTML = "<a href='#' onclick='openNextUnreadFeed()'>" +
						__("Click to open next unread feed.") + "</a>";
					}

				}

			}
		}

		if (articles) {
			for (var i = 0; i < articles.length; i++) {
				var a_id = articles[i]['id'];
				cache_set("article:" + a_id, articles[i]['content']);
			}
		} else {
			console.log("no cached articles received");
		}

		if (counters)
			parse_counters(counters);
		else
			request_counters();

	} else {
		console.error("Invalid object received: " + transport.responseText);
		dijit.byId("headlines-frame").attr('content', "<div class='whiteBox'>" +
				__('Could not update headlines (invalid object received - see error console for details)') +
				"</div>");
	}

	_infscroll_request_sent = 0;
	_last_headlines_update = new Date().getTime();

	unpackVisibleHeadlines();

	// if we have some more space in the buffer, why not try to fill it

	if (!_infscroll_disable && $("headlines-spacer") &&
			$("headlines-spacer").offsetTop < $("headlines-frame").offsetHeight) {

		window.setTimeout(function() {
			loadMoreHeadlines();
		}, 250);
	}

	notify("");
}

function render_article(article) {
	cleanup_memory("content-insert");

	dijit.byId("headlines-wrap-inner").addChild(
			dijit.byId("content-insert"));

	var c = dijit.byId("content-insert");

	try {
		c.domNode.scrollTop = 0;
	} catch (e) { };

	c.attr('content', article);
	PluginHost.run(PluginHost.HOOK_ARTICLE_RENDERED, c.domNode);

	correctHeadlinesOffset(getActiveArticleId());

	try {
		c.focus();
	} catch (e) { };
}

function showArticleInHeadlines(id, noexpand) {
	var row = $("RROW-" + id);
	if (!row) return;

	if (!noexpand)
		row.removeClassName("Unread");

	row.addClassName("active");

	selectArticles('none');

	markHeadline(id);
}

function article_callback2(transport, id) {
	console.log("article_callback2 " + id);

	handle_rpc_json(transport);

	var reply = false;

	try {
		reply = JSON.parse(transport.responseText);
	} catch (e) {
		console.error(e);
	}

	if (reply) {

		reply.each(function(article) {
			if (getActiveArticleId() == article['id']) {
				render_article(article['content']);
			}
			cids_requested.remove(article['id']);

			cache_set("article:" + article['id'], article['content']);
		});

//			if (id != last_requested_article) {
//				console.log("requested article id is out of sequence, aborting");
//				return;
//			}

	} else {
		console.error("Invalid object received: " + transport.responseText);

		render_article("<div class='whiteBox'>" +
				__('Could not display article (invalid object received - see error console for details)') + "</div>");
	}

	var unread_in_buffer = $$("#headlines-frame > div[id*=RROW][class*=Unread]").length
	request_counters(unread_in_buffer == 0);

	notify("");
}

function view(id, activefeed, noexpand) {
	var oldrow = $("RROW-" + getActiveArticleId());
	if (oldrow) oldrow.removeClassName("active");

	var crow = $("RROW-" + id);

	if (!crow) return;
	if (noexpand) {
		setActiveArticleId(id);
		showArticleInHeadlines(id, noexpand);
		return;
	}

	console.log("loading article: " + id);

	var cached_article = cache_get("article:" + id);

	console.log("cache check result: " + (cached_article != false));

	var query = "?op=article&method=view&id=" + param_escape(id);

	var neighbor_ids = getRelativePostIds(id);

	/* only request uncached articles */

	var cids_to_request = [];

	for (var i = 0; i < neighbor_ids.length; i++) {
		if (cids_requested.indexOf(neighbor_ids[i]) == -1)
			if (!cache_get("article:" + neighbor_ids[i])) {
				cids_to_request.push(neighbor_ids[i]);
				cids_requested.push(neighbor_ids[i]);
			}
	}

	console.log("additional ids: " + cids_to_request.toString());

	query = query + "&cids=" + cids_to_request.toString();

	var article_is_unread = crow.hasClassName("Unread");

	setActiveArticleId(id);
	showArticleInHeadlines(id);

	if (cached_article && article_is_unread) {

		query = query + "&mode=prefetch";

		render_article(cached_article);

	} else if (cached_article) {

		query = query + "&mode=prefetch_old";
		render_article(cached_article);

		// if we don't need to request any relative ids, we might as well skip
		// the server roundtrip altogether
		if (cids_to_request.length == 0) {
			return;
		}
	}

	last_requested_article = id;

	console.log(query);

	if (article_is_unread) {
		decrementFeedCounter(getActiveFeedId(), activeFeedIsCat());
	}

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function(transport) {
			article_callback2(transport, id);
		} });

	return false;

}

function toggleMark(id, client_only) {
	var query = "?op=rpc&id=" + id + "&method=mark";

	var row = $("RROW-" + id);
	if (!row) return;

	var imgs = [];

	var row_imgs = row.getElementsByClassName("markedPic");

	for (var i = 0; i < row_imgs.length; i++)
		imgs.push(row_imgs[i]);

	var ft = $("floatingTitle");

	if (ft && ft.getAttribute("data-article-id") == id) {
		var fte = ft.getElementsByClassName("markedPic");

		for (var i = 0; i < fte.length; i++)
			imgs.push(fte[i]);
	}

	for (i = 0; i < imgs.length; i++) {
		var img = imgs[i];

		if (!row.hasClassName("marked")) {
			img.src = img.src.replace("mark_unset", "mark_set");
			img.alt = __("Unstar article");
			query = query + "&mark=1";
		} else {
			img.src = img.src.replace("mark_set", "mark_unset");
			img.alt = __("Star article");
			query = query + "&mark=0";
		}
	}

	row.toggleClassName("marked");

	if (!client_only) {
		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function (transport) {
				handle_rpc_json(transport);
			}
		});
	}
}

function togglePub(id, client_only, no_effects, note) {
	var query = "?op=rpc&id=" + id + "&method=publ";

	if (note != undefined) {
		query = query + "&note=" + param_escape(note);
	} else {
		query = query + "&note=undefined";
	}

	var row = $("RROW-" + id);
	if (!row) return;

	var imgs = [];

	var row_imgs = row.getElementsByClassName("pubPic");

	for (var i = 0; i < row_imgs.length; i++)
		imgs.push(row_imgs[i]);

	var ft = $("floatingTitle");

	if (ft && ft.getAttribute("data-article-id") == id) {
		var fte = ft.getElementsByClassName("pubPic");

		for (var i = 0; i < fte.length; i++)
			imgs.push(fte[i]);
	}

	for (i = 0; i < imgs.length; i++) {
		var img = imgs[i];

		if (!row.hasClassName("published") || note != undefined) {
			img.src = img.src.replace("pub_unset", "pub_set");
			img.alt = __("Unpublish article");
			query = query + "&pub=1";
		} else {
			img.src = img.src.replace("pub_set", "pub_unset");
			img.alt = __("Publish article");
			query = query + "&pub=0";
		}
	}

	if (note != undefined)
		row.addClassName("published");
	else
		row.toggleClassName("published");

	if (!client_only) {
		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				handle_rpc_json(transport);
			} });
	}

}

function moveToPost(mode, noscroll, noexpand) {
	var rows = getLoadedArticleIds();

	var prev_id = false;
	var next_id = false;

	if (!$('RROW-' + getActiveArticleId())) {
		setActiveArticleId(0);
	}

	if (!getActiveArticleId()) {
		next_id = rows[0];
		prev_id = rows[rows.length-1]
	} else {
		for (var i = 0; i < rows.length; i++) {
			if (rows[i] == getActiveArticleId()) {

				// Account for adjacent identical article ids.
				if (i > 0) prev_id = rows[i-1];

				for (var j = i+1; j < rows.length; j++) {
					if (rows[j] != getActiveArticleId()) {
						next_id = rows[j];
						break;
					}
				}
				break;
			}
		}
	}

	console.log("cur: " + getActiveArticleId() + " next: " + next_id);

	if (mode == "next") {
		if (next_id || getActiveArticleId()) {
			if (isCdmMode()) {

				var article = $("RROW-" + getActiveArticleId());
				var ctr = $("headlines-frame");

				if (!noscroll && article && article.offsetTop + article.offsetHeight >
						ctr.scrollTop + ctr.offsetHeight) {

					scrollArticle(ctr.offsetHeight/4);

				} else if (next_id) {
					cdmExpandArticle(next_id, noexpand);
					cdmScrollToArticleId(next_id, true);
				}

			} else if (next_id) {
				correctHeadlinesOffset(next_id);
				view(next_id, getActiveFeedId(), noexpand);
			}
		}
	}

	if (mode == "prev") {
		if (prev_id || getActiveArticleId()) {
			if (isCdmMode()) {

				var article = $("RROW-" + getActiveArticleId());
				var prev_article = $("RROW-" + prev_id);
				var ctr = $("headlines-frame");

				if (!getInitParam("cdm_expanded")) {

					if (!noscroll && article && article.offsetTop < ctr.scrollTop) {
						scrollArticle(-ctr.offsetHeight/4);
					} else {
						cdmExpandArticle(prev_id, noexpand);
						cdmScrollToArticleId(prev_id, true);
					}
				} else {

					if (!noscroll && article && article.offsetTop < ctr.scrollTop) {
						scrollArticle(-ctr.offsetHeight/3);
					} else if (!noscroll && prev_article &&
							prev_article.offsetTop < ctr.scrollTop) {
						cdmExpandArticle(prev_id, noexpand);
						scrollArticle(-ctr.offsetHeight/4);
					} else if (prev_id) {
						cdmExpandArticle(prev_id, noexpand);
						cdmScrollToArticleId(prev_id, noscroll);
					}
				}

			} else if (prev_id) {
				correctHeadlinesOffset(prev_id);
				view(prev_id, getActiveFeedId(), noexpand);
			}
		}
	}

}

function toggleSelected(id, force_on) {
	var row = $("RROW-" + id);

	if (row) {
		var cb = dijit.getEnclosingWidget(
				row.getElementsByClassName("rchk")[0]);

		if (row.hasClassName('Selected') && !force_on) {
			row.removeClassName('Selected');
			if (cb) cb.attr("checked", false);
		} else {
			row.addClassName('Selected');
			if (cb) cb.attr("checked", true);
		}
	}

	updateSelectedPrompt();
}

function updateSelectedPrompt() {
	var count = getSelectedArticleIds2().size();
	var elem = $("selected_prompt");

	if (elem) {
		elem.innerHTML = ngettext("%d article selected",
				"%d articles selected", count).replace("%d", count);

		if (count > 0)
			Element.show(elem);
		else
			Element.hide(elem);
	}

}

function toggleUnread(id, cmode, effect) {
	var row = $("RROW-" + id);
	if (row) {
		var tmpClassName = row.className;

		if (cmode == undefined || cmode == 2) {
			if (row.hasClassName("Unread")) {
				row.removeClassName("Unread");

			} else {
				row.addClassName("Unread");
			}

		} else if (cmode == 0) {

			row.removeClassName("Unread");

		} else if (cmode == 1) {
			row.addClassName("Unread");
		}

		if (cmode == undefined) cmode = 2;

		var query = "?op=rpc&method=catchupSelected" +
			"&cmode=" + param_escape(cmode) + "&ids=" + param_escape(id);

//			notify_progress("Loading, please wait...");

		if (tmpClassName != row.className) {
			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function (transport) {
					handle_rpc_json(transport);
				}
			});
		}

	}
}

function selectionRemoveLabel(id, ids) {
	if (!ids) ids = getSelectedArticleIds2();

	if (ids.length == 0) {
		alert(__("No articles are selected."));
		return;
	}

	var query = "?op=article&method=removeFromLabel&ids=" +
		param_escape(ids.toString()) + "&lid=" + param_escape(id);

	console.log(query);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function(transport) {
			handle_rpc_json(transport);
			show_labels_in_headlines(transport);
		} });

}

function selectionAssignLabel(id, ids) {
	if (!ids) ids = getSelectedArticleIds2();

	if (ids.length == 0) {
		alert(__("No articles are selected."));
		return;
	}

	var query = "?op=article&method=assignToLabel&ids=" +
		param_escape(ids.toString()) + "&lid=" + param_escape(id);

	console.log(query);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function(transport) {
			handle_rpc_json(transport);
			show_labels_in_headlines(transport);
		} });
}

function selectionToggleUnread(set_state, callback, no_error, ids) {
	var rows = ids ? ids : getSelectedArticleIds2();

	if (rows.length == 0 && !no_error) {
		alert(__("No articles are selected."));
		return;
	}

	for (var i = 0; i < rows.length; i++) {
		var row = $("RROW-" + rows[i]);
		if (row) {
			if (set_state == undefined) {
				if (row.hasClassName("Unread")) {
					row.removeClassName("Unread");
				} else {
					row.addClassName("Unread");
				}
			}

			if (set_state == false) {
				row.removeClassName("Unread");
			}

			if (set_state == true) {
				row.addClassName("Unread");
			}
		}
	}

	updateFloatingTitle(true);

	if (rows.length > 0) {

		var cmode = "";

		if (set_state == undefined) {
			cmode = "2";
		} else if (set_state == true) {
			cmode = "1";
		} else if (set_state == false) {
			cmode = "0";
		}

		var query = "?op=rpc&method=catchupSelected" +
			"&cmode=" + cmode + "&ids=" + param_escape(rows.toString());

		notify_progress("Loading, please wait...");

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				handle_rpc_json(transport);
				if (callback) callback(transport);
			} });

	}
}

// sel_state ignored
function selectionToggleMarked(sel_state, callback, no_error, ids) {
	var rows = ids ? ids : getSelectedArticleIds2();

	if (rows.length == 0 && !no_error) {
		alert(__("No articles are selected."));
		return;
	}

	for (var i = 0; i < rows.length; i++) {
		toggleMark(rows[i], true, true);
	}

	if (rows.length > 0) {

		var query = "?op=rpc&method=markSelected&ids=" +
			param_escape(rows.toString()) + "&cmode=2";

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				handle_rpc_json(transport);
				if (callback) callback(transport);
			} });

	}
}

// sel_state ignored
function selectionTogglePublished(sel_state, callback, no_error, ids) {
	var rows = ids ? ids : getSelectedArticleIds2();

	if (rows.length == 0 && !no_error) {
		alert(__("No articles are selected."));
		return;
	}

	for (var i = 0; i < rows.length; i++) {
		togglePub(rows[i], true, true);
	}

	if (rows.length > 0) {

		var query = "?op=rpc&method=publishSelected&ids=" +
			param_escape(rows.toString()) + "&cmode=2";

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function(transport) {
				handle_rpc_json(transport);
			} });

	}
}

function getSelectedArticleIds2() {

	var rv = [];

	$$("#headlines-frame > div[id*=RROW][class*=Selected]").each(
		function(child) {
			rv.push(child.getAttribute("data-article-id"));
		});

	return rv;
}

function getLoadedArticleIds() {
	var rv = [];

	var children = $$("#headlines-frame > div[id*=RROW-]");

	children.each(function(child) {
		if (Element.visible(child)) {
			rv.push(child.getAttribute("data-article-id"));
		}
	});

	return rv;

}

// mode = all,none,unread,invert,marked,published
function selectArticles(mode, query) {
	if (!query) query = "#headlines-frame > div[id*=RROW]";

	var children = $$(query);

	children.each(function(child) {
		var id = child.getAttribute("data-article-id");

		var cb = dijit.getEnclosingWidget(
				child.getElementsByClassName("rchk")[0]);

		if (mode == "all") {
			child.addClassName("Selected");
			if (cb) cb.attr("checked", true);
		} else if (mode == "unread") {
			if (child.hasClassName("Unread")) {
				child.addClassName("Selected");
				if (cb) cb.attr("checked", true);
			} else {
				child.removeClassName("Selected");
				if (cb) cb.attr("checked", false);
			}
		} else if (mode == "marked") {
			if (child.hasClassName("marked")) {
				child.addClassName("Selected");
				if (cb) cb.attr("checked", true);
			} else {
				child.removeClassName("Selected");
				if (cb) cb.attr("checked", false);
			}
		} else if (mode == "published") {
			if (child.hasClassName("published")) {
				child.addClassName("Selected");
				if (cb) cb.attr("checked", true);
			} else {
				child.removeClassName("Selected");
				if (cb) cb.attr("checked", false);
			}

		} else if (mode == "invert") {
			if (child.hasClassName("Selected")) {
				child.removeClassName("Selected");
				if (cb) cb.attr("checked", false);
			} else {
				child.addClassName("Selected");
				if (cb) cb.attr("checked", true);
			}

		} else {
			child.removeClassName("Selected");
			if (cb) cb.attr("checked", false);
		}
	});

	updateSelectedPrompt();
}

function deleteSelection() {

	var rows = getSelectedArticleIds2();

	if (rows.length == 0) {
		alert(__("No articles are selected."));
		return;
	}

	var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());
	var str;

	if (getActiveFeedId() != 0) {
		str = ngettext("Delete %d selected article in %s?", "Delete %d selected articles in %s?", rows.length);
	} else {
		str = ngettext("Delete %d selected article?", "Delete %d selected articles?", rows.length);
	}

	str = str.replace("%d", rows.length);
	str = str.replace("%s", fn);

	if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
		return;
	}

	query = "?op=rpc&method=delete&ids=" + param_escape(rows);

	console.log(query);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function (transport) {
			handle_rpc_json(transport);
			viewCurrentFeed();
		}
	});
}

function archiveSelection() {

	var rows = getSelectedArticleIds2();

	if (rows.length == 0) {
		alert(__("No articles are selected."));
		return;
	}

	var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());
	var str;
	var op;

	if (getActiveFeedId() != 0) {
		str = ngettext("Archive %d selected article in %s?", "Archive %d selected articles in %s?", rows.length);
		op = "archive";
	} else {
		str = ngettext("Move %d archived article back?", "Move %d archived articles back?", rows.length);

		str += " " + __("Please note that unstarred articles might get purged on next feed update.");

		op = "unarchive";
	}

	str = str.replace("%d", rows.length);
	str = str.replace("%s", fn);

	if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
		return;
	}

	query = "?op=rpc&method="+op+"&ids=" + param_escape(rows);

	console.log(query);

	for (var i = 0; i < rows.length; i++) {
		cache_delete("article:" + rows[i]);
	}

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function(transport) {
				handle_rpc_json(transport);
				viewCurrentFeed();
			} });

}

function catchupSelection() {

	var rows = getSelectedArticleIds2();

	if (rows.length == 0) {
		alert(__("No articles are selected."));
		return;
	}

	var fn = getFeedName(getActiveFeedId(), activeFeedIsCat());

	var str = ngettext("Mark %d selected article in %s as read?", "Mark %d selected articles in %s as read?", rows.length);

	str = str.replace("%d", rows.length);
	str = str.replace("%s", fn);

	if (getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
		return;
	}

	selectionToggleUnread(false, 'viewCurrentFeed()', true);
}

function editArticleTags(id) {
	var query = "backend.php?op=article&method=editArticleTags&param=" + param_escape(id);

	if (dijit.byId("editTagsDlg"))
		dijit.byId("editTagsDlg").destroyRecursive();

	dialog = new dijit.Dialog({
		id: "editTagsDlg",
		title: __("Edit article Tags"),
		style: "width: 600px",
		execute: function() {
			if (this.validate()) {
				var query = dojo.objectToQuery(this.attr('value'));

				notify_progress("Saving article tags...", true);

				new Ajax.Request("backend.php",	{
				parameters: query,
				onComplete: function(transport) {
					try {
						notify('');
						dialog.hide();

						var data = JSON.parse(transport.responseText);

						if (data) {
							var id = data.id;

							console.log(id);

							var tags = $("ATSTR-" + id);
							var tooltip = dijit.byId("ATSTRTIP-" + id);

							if (tags) tags.innerHTML = data.content;
							if (tooltip) tooltip.attr('label', data.content_full);
						}
					} catch (e) {
						exception_error(e);
					}

				}});
			}
		},
		href: query
	});

	var tmph = dojo.connect(dialog, 'onLoad', function() {
		dojo.disconnect(tmph);

		new Ajax.Autocompleter('tags_str', 'tags_choices',
		   "backend.php?op=article&method=completeTags",
		   { tokens: ',', paramName: "search" });
	});

	dialog.show();

}

function cdmScrollToArticleId(id, force) {
	var ctr = $("headlines-frame");
	var e = $("RROW-" + id);

	if (!e || !ctr) return;

	if (force || e.offsetTop+e.offsetHeight > (ctr.scrollTop+ctr.offsetHeight) ||
			e.offsetTop < ctr.scrollTop) {

		// expanded cdm has a 4px margin now
		ctr.scrollTop = parseInt(e.offsetTop) - 4;
	}
}

function setActiveArticleId(id) {
	console.log("setActiveArticleId:" + id);

	_active_article_id = id;
	PluginHost.run(PluginHost.HOOK_ARTICLE_SET_ACTIVE, _active_article_id);
}

function getActiveArticleId() {
	return _active_article_id;
}

function postMouseIn(e, id) {
	post_under_pointer = id;
}

function postMouseOut(id) {
	post_under_pointer = false;
}

function unpackVisibleHeadlines() {
	if (!isCdmMode() || !getInitParam("cdm_expanded")) return;

	$$("#headlines-frame span.cencw[id]").each(
		function (child) {
			var row = $("RROW-" + child.id.replace("CENCW-", ""));

			if (row && row.offsetTop <= $("headlines-frame").scrollTop +
				$("headlines-frame").offsetHeight) {

				//console.log("unpacking: " + child.id);

				child.innerHTML = htmlspecialchars_decode(child.innerHTML);
				child.removeAttribute('id');

				PluginHost.run(PluginHost.HOOK_ARTICLE_RENDERED_CDM, row);

				Element.show(child);
			}
		}
	);
}

function headlines_scroll_handler(e) {
	try {

		// rate-limit in case of smooth scrolling and similar abominations
		if (Math.max(e.scrollTop, _headlines_scroll_offset) - Math.min(e.scrollTop, _headlines_scroll_offset) < 25) {
			return;
		}

		_headlines_scroll_offset = e.scrollTop;

		var hsp = $("headlines-spacer");

		unpackVisibleHeadlines();

		// set topmost child in the buffer as active
		if (isCdmMode() && getInitParam("cdm_auto_catchup") == 1 &&
				getSelectedArticleIds2().length <= 1 &&
				getInitParam("cdm_expanded")) {

			var rows = $$("#headlines-frame > div[id*=RROW]");

			for (var i = 0; i < rows.length; i++) {
				var child = rows[i];

				if ($("headlines-frame").scrollTop <= child.offsetTop &&
					child.offsetTop - $("headlines-frame").scrollTop < 100 &&
					child.getAttribute("data-article-id") != _active_article_id) {

					if (_active_article_id) {
						var row = $("RROW-" + _active_article_id);
						if (row) row.removeClassName("active");
					}

					_active_article_id = child.getAttribute("data-article-id");
					showArticleInHeadlines(_active_article_id, true);
					updateSelectedPrompt();
					break;
				}
			}
		}

		if (!_infscroll_disable) {
			if (hsp && hsp.offsetTop - 250 <= e.scrollTop + e.offsetHeight) {

				hsp.innerHTML = "<span class='loading'><img src='images/indicator_tiny.gif'> " +
					__("Loading, please wait...") + "</span>";

				loadMoreHeadlines();
				return;

			}
		}

		if (isCdmMode()) {
			updateFloatingTitle();
		}

		catchupCurrentBatchIfNeeded();

		if (getInitParam("cdm_auto_catchup") == 1) {

			// let's get DOM some time to settle down
			var ts = new Date().getTime();
			if (ts - _last_headlines_update < 100) return;

			$$("#headlines-frame > div[id*=RROW][class*=Unread]").each(
				function(child) {
					if (child.hasClassName("Unread") && $("headlines-frame").scrollTop >
							(child.offsetTop + child.offsetHeight/2)) {

						var id = child.getAttribute("data-article-id")

						if (catchup_id_batch.indexOf(id) == -1)
							catchup_id_batch.push(id);

						//console.log("auto_catchup_batch: " + catchup_id_batch.toString());
					}

				});

			if (_infscroll_disable) {
				var child = $$("#headlines-frame div[id*=RROW]").last();

				if (child && $("headlines-frame").scrollTop >
						(child.offsetTop + child.offsetHeight - 50)) {

					console.log("we seem to be at an end");

					if (getInitParam("on_catchup_show_next_feed") == "1") {
						openNextUnreadFeed();
					}
				}
			}
		}

	} catch (e) {
		console.warn("headlines_scroll_handler: " + e);
	}
}

function openNextUnreadFeed() {
	var is_cat = activeFeedIsCat();
	var nuf = getNextUnreadFeed(getActiveFeedId(), is_cat);
	if (nuf) viewfeed({feed: nuf, is_cat: is_cat});
}

function catchupBatchedArticles() {
	if (catchup_id_batch.length > 0 && !_infscroll_request_sent && !_catchup_request_sent) {

		console.log("catchupBatchedArticles: working");

		// make a copy of the array
		var batch = catchup_id_batch.slice();
		var query = "?op=rpc&method=catchupSelected" +
			"&cmode=0&ids=" + param_escape(batch.toString());

		console.log(query);

		_catchup_request_sent = true;

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function (transport) {
				handle_rpc_json(transport);

				_catchup_request_sent = false;

				reply = JSON.parse(transport.responseText);
				var batch = reply.ids;

				batch.each(function (id) {
					console.log(id);
					var elem = $("RROW-" + id);
					if (elem) elem.removeClassName("Unread");
					catchup_id_batch.remove(id);
				});

				updateFloatingTitle(true);

			}
		});
	}
}

function catchupRelativeToArticle(below, id) {

	if (!id) id = getActiveArticleId();

	if (!id) {
		alert(__("No article is selected."));
		return;
	}

	var visible_ids = getLoadedArticleIds();

	var ids_to_mark = new Array();

	if (!below) {
		for (var i = 0; i < visible_ids.length; i++) {
			if (visible_ids[i] != id) {
				var e = $("RROW-" + visible_ids[i]);

				if (e && e.hasClassName("Unread")) {
					ids_to_mark.push(visible_ids[i]);
				}
			} else {
				break;
			}
		}
	} else {
		for (var i = visible_ids.length - 1; i >= 0; i--) {
			if (visible_ids[i] != id) {
				var e = $("RROW-" + visible_ids[i]);

				if (e && e.hasClassName("Unread")) {
					ids_to_mark.push(visible_ids[i]);
				}
			} else {
				break;
			}
		}
	}

	if (ids_to_mark.length == 0) {
		alert(__("No articles found to mark"));
	} else {
		var msg = ngettext("Mark %d article as read?", "Mark %d articles as read?", ids_to_mark.length).replace("%d", ids_to_mark.length);

		if (getInitParam("confirm_feed_catchup") != 1 || confirm(msg)) {

			for (var i = 0; i < ids_to_mark.length; i++) {
				var e = $("RROW-" + ids_to_mark[i]);
				e.removeClassName("Unread");
			}

			var query = "?op=rpc&method=catchupSelected" +
				"&cmode=0" + "&ids=" + param_escape(ids_to_mark.toString());

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function (transport) {
					handle_rpc_json(transport);
				}
			});

		}
	}
}

function cdmCollapseArticle(event, id, unmark) {
	if (unmark == undefined) unmark = true;

	var row = $("RROW-" + id);
	var elem = $("CICD-" + id);

	if (elem && row) {
		var collapse = row.select("span[class='collapseBtn']")[0];

		Element.hide(elem);
		Element.show("CEXC-" + id);
		Element.hide(collapse);

		if (unmark) {
			row.removeClassName("active");

			markHeadline(id, false);

			if (id == getActiveArticleId()) {
				setActiveArticleId(0);
			}

			updateSelectedPrompt();
		}

		if (event) Event.stop(event);

		PluginHost.run(PluginHost.HOOK_ARTICLE_COLLAPSED, id);

		if (row.offsetTop < $("headlines-frame").scrollTop)
			scrollToRowId(row.id);

		$("floatingTitle").style.visibility = "hidden";
		$("floatingTitle").setAttribute("data-article-id", 0);
	}
}

function cdmExpandArticle(id, noexpand) {
	console.log("cdmExpandArticle " + id);

	var row = $("RROW-" + id);

	if (!row) return false;

	var oldrow = $("RROW-" + getActiveArticleId());

	var elem = $("CICD-" + getActiveArticleId());

	if (id == getActiveArticleId() && Element.visible(elem))
		return true;

	selectArticles("none");

	var old_offset = row.offsetTop;

	if (getActiveArticleId() && elem && !getInitParam("cdm_expanded")) {
		var collapse = oldrow.select("span[class='collapseBtn']")[0];

		Element.hide(elem);
		Element.show("CEXC-" + getActiveArticleId());
		Element.hide(collapse);
	}

	if (oldrow) oldrow.removeClassName("active");

	setActiveArticleId(id);

	elem = $("CICD-" + id);

	var collapse = row.select("span[class='collapseBtn']")[0];

	var cencw = $("CENCW-" + id);

	if (!Element.visible(elem) && !noexpand) {
		if (cencw) {
			cencw.innerHTML = htmlspecialchars_decode(cencw.innerHTML);
			cencw.setAttribute('id', '');
			Element.show(cencw);
		}

		Element.show(elem);
		Element.hide("CEXC-" + id);
		Element.show(collapse);
	}

	var new_offset = row.offsetTop;

	if (old_offset > new_offset)
		$("headlines-frame").scrollTop -= (old_offset - new_offset);

	if (!noexpand) {
		if (catchup_id_batch.indexOf(id) == -1)
			catchup_id_batch.push(id);

		catchupCurrentBatchIfNeeded();
	}

	toggleSelected(id);
	row.addClassName("active");

	PluginHost.run(PluginHost.HOOK_ARTICLE_EXPANDED, id);

	return false;
}

function getArticleUnderPointer() {
	return post_under_pointer;
}

function scrollArticle(offset) {
	if (!isCdmMode()) {
		var ci = $("content-insert");
		if (ci) {
			ci.scrollTop += offset;
		}
	} else {
		var hi = $("headlines-frame");
		if (hi) {
			hi.scrollTop += offset;
		}

	}
}

function show_labels_in_headlines(transport) {
	var data = JSON.parse(transport.responseText);

	if (data) {
		data['info-for-headlines'].each(function (elem) {
			$$(".HLLCTR-" + elem.id).each(function (ctr) {
				ctr.innerHTML = elem.labels;
			});
		});
	}
}

function cdmClicked(event, id, in_body) {
	//var shift_key = event.shiftKey;

	if (!event.ctrlKey && !event.metaKey) {

		if (!getInitParam("cdm_expanded")) {
			return cdmExpandArticle(id);
		} else {

			var elem = $("RROW-" + getActiveArticleId());

			if (elem) elem.removeClassName("active");

			selectArticles("none");
			toggleSelected(id);

			var elem = $("RROW-" + id);
			var article_is_unread = elem.hasClassName("Unread");

			elem.removeClassName("Unread");
			elem.addClassName("active");

			setActiveArticleId(id);

			if (article_is_unread) {
				decrementFeedCounter(getActiveFeedId(), activeFeedIsCat());
				updateFloatingTitle(true);
			}

			var query = "?op=rpc&method=catchupSelected" +
				"&cmode=0&ids=" + param_escape(id);

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function (transport) {
					handle_rpc_json(transport);
				}
			});

			return !event.shiftKey;
		}

	} else if (!in_body) {

		toggleSelected(id, true);

		var elem = $("RROW-" + id);
		var article_is_unread = elem.hasClassName("Unread");

		if (article_is_unread) {
			decrementFeedCounter(getActiveFeedId(), activeFeedIsCat());
		}

		toggleUnread(id, 0, false);

		openArticleInNewWindow(id);
	} else {
		return true;
	}

	var unread_in_buffer = $$("#headlines-frame > div[id*=RROW][class*=Unread]").length
	request_counters(unread_in_buffer == 0);

	return false;
}

function hlClicked(event, id) {
	if (event.which == 2) {
		view(id);
		return true;
	} else if (event.ctrlKey || event.metaKey) {
		toggleSelected(id, true);
		toggleUnread(id, 0, false);
		openArticleInNewWindow(id);
		return false;
	} else {
		view(id);
		return false;
	}
}

function openArticleInNewWindow(id) {
	toggleUnread(id, 0, false);

	var w = window.open("");
	w.opener = null;
	w.location = "backend.php?op=article&method=redirect&id=" + id;
}

function isCdmMode() {
	return getInitParam("combined_display_mode");
}

function markHeadline(id, marked) {
	if (marked == undefined) marked = true;

	var row = $("RROW-" + id);
	if (row) {
		var check = dijit.getEnclosingWidget(
				row.getElementsByClassName("rchk")[0]);

		if (check) {
			check.attr("checked", marked);
		}

		if (marked)
			row.addClassName("Selected");
		else
			row.removeClassName("Selected");
	}
}

function getRelativePostIds(id, limit) {

	var tmp = [];

	if (!limit) limit = 6; //3

	var ids = getLoadedArticleIds();

	for (var i = 0; i < ids.length; i++) {
		if (ids[i] == id) {
			for (var k = 1; k <= limit; k++) {
				//if (i > k-1) tmp.push(ids[i-k]);
				if (i < ids.length - k) tmp.push(ids[i + k]);
			}
			break;
		}
	}

	return tmp;
}

function correctHeadlinesOffset(id) {

	var container = $("headlines-frame");
	var row = $("RROW-" + id);

	if (!container || !row) return;

	var viewport = container.offsetHeight;

	var rel_offset_top = row.offsetTop - container.scrollTop;
	var rel_offset_bottom = row.offsetTop + row.offsetHeight - container.scrollTop;

	//console.log("Rtop: " + rel_offset_top + " Rbtm: " + rel_offset_bottom);
	//console.log("Vport: " + viewport);

	if (rel_offset_top <= 0 || rel_offset_top > viewport) {
		container.scrollTop = row.offsetTop;
	} else if (rel_offset_bottom > viewport) {

		/* doesn't properly work with Opera in some cases because
		 Opera fucks up element scrolling */

		container.scrollTop = row.offsetTop + row.offsetHeight - viewport;
	}
}

function headlineActionsChange(elem) {
	eval(elem.value);
	elem.attr('value', 'false');
}

function closeArticlePanel() {

	if (dijit.byId("content-insert"))
		dijit.byId("headlines-wrap-inner").removeChild(
			dijit.byId("content-insert"));
}

function initFloatingMenu() {
	if (!dijit.byId("floatingMenu")) {

		var menu = new dijit.Menu({
			id: "floatingMenu",
			targetNodeIds: ["floatingTitle"]
		});

		headlinesMenuCommon(menu);

		menu.startup();
	}
}

function headlinesMenuCommon(menu) {

	menu.addChild(new dijit.MenuItem({
		label: __("Open original article"),
		onClick: function (event) {
			openArticleInNewWindow(this.getParent().currentTarget.getAttribute("data-article-id"));
		}
	}));

	menu.addChild(new dijit.MenuItem({
		label: __("Display article URL"),
		onClick: function (event) {
			displayArticleUrl(this.getParent().currentTarget.getAttribute("data-article-id"));
		}
	}));

	menu.addChild(new dijit.MenuSeparator());

	menu.addChild(new dijit.MenuItem({
		label: __("Toggle unread"),
		onClick: function (event) {

			var ids = getSelectedArticleIds2();
			// cast to string
			var id = (this.getParent().currentTarget.getAttribute("data-article-id")) + "";
			ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

			selectionToggleUnread(undefined, false, true, ids);
		}
	}));

	menu.addChild(new dijit.MenuItem({
		label: __("Toggle starred"),
		onClick: function (event) {
			var ids = getSelectedArticleIds2();
			// cast to string
			var id = (this.getParent().currentTarget.getAttribute("data-article-id")) + "";
			ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

			selectionToggleMarked(undefined, false, true, ids);
		}
	}));

	menu.addChild(new dijit.MenuItem({
		label: __("Toggle published"),
		onClick: function (event) {
			var ids = getSelectedArticleIds2();
			// cast to string
			var id = (this.getParent().currentTarget.getAttribute("data-article-id")) + "";
			ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

			selectionTogglePublished(undefined, false, true, ids);
		}
	}));

	menu.addChild(new dijit.MenuSeparator());

	menu.addChild(new dijit.MenuItem({
		label: __("Mark above as read"),
		onClick: function (event) {
			catchupRelativeToArticle(0, this.getParent().currentTarget.getAttribute("data-article-id"));
		}
	}));

	menu.addChild(new dijit.MenuItem({
		label: __("Mark below as read"),
		onClick: function (event) {
			catchupRelativeToArticle(1, this.getParent().currentTarget.getAttribute("data-article-id"));
		}
	}));


	var labels = getInitParam("labels");

	if (labels && labels.length) {

		menu.addChild(new dijit.MenuSeparator());

		var labelAddMenu = new dijit.Menu({ownerMenu: menu});
		var labelDelMenu = new dijit.Menu({ownerMenu: menu});

		labels.each(function (label) {
			var bare_id = label.id;
			var name = label.caption;

			labelAddMenu.addChild(new dijit.MenuItem({
				label: name,
				labelId: bare_id,
				onClick: function (event) {

					var ids = getSelectedArticleIds2();
					// cast to string
					var id = (this.getParent().ownerMenu.currentTarget.getAttribute("data-article-id")) + "";

					ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

					selectionAssignLabel(this.labelId, ids);
				}
			}));

			labelDelMenu.addChild(new dijit.MenuItem({
				label: name,
				labelId: bare_id,
				onClick: function (event) {
					var ids = getSelectedArticleIds2();
					// cast to string
					var id = (this.getParent().ownerMenu.currentTarget.getAttribute("data-article-id")) + "";

					ids = ids.size() != 0 && ids.indexOf(id) != -1 ? ids : [id];

					selectionRemoveLabel(this.labelId, ids);
				}
			}));

		});

		menu.addChild(new dijit.PopupMenuItem({
			label: __("Assign label"),
			popup: labelAddMenu
		}));

		menu.addChild(new dijit.PopupMenuItem({
			label: __("Remove label"),
			popup: labelDelMenu
		}));

	}
}

function initHeadlinesMenu() {
	if (!dijit.byId("headlinesMenu")) {

		var menu = new dijit.Menu({
			id: "headlinesMenu",
			targetNodeIds: ["headlines-frame"],
			selector: ".hlMenuAttach"
		});

		headlinesMenuCommon(menu);

		menu.startup();
	}

	/* vgroup feed title menu */

	if (!dijit.byId("headlinesFeedTitleMenu")) {

		var menu = new dijit.Menu({
			id: "headlinesFeedTitleMenu",
			targetNodeIds: ["headlines-frame"],
			selector: "div.cdmFeedTitle"
		});

		menu.addChild(new dijit.MenuItem({
			label: __("Select articles in group"),
			onClick: function (event) {
				selectArticles("all",
					"#headlines-frame > div[id*=RROW]" +
					"[data-orig-feed-id='" + this.getParent().currentTarget.getAttribute("data-feed-id") + "']");

			}
		}));

		menu.addChild(new dijit.MenuItem({
			label: __("Mark group as read"),
			onClick: function (event) {
				selectArticles("none");
				selectArticles("all",
					"#headlines-frame > div[id*=RROW]" +
					"[data-orig-feed-id='" + this.getParent().currentTarget.getAttribute("data-feed-id") + "']");

				catchupSelection();
			}
		}));

		menu.addChild(new dijit.MenuItem({
			label: __("Mark feed as read"),
			onClick: function (event) {
				catchupFeedInGroup(this.getParent().currentTarget.getAttribute("data-feed-id"));
			}
		}));

		menu.addChild(new dijit.MenuItem({
			label: __("Edit feed"),
			onClick: function (event) {
				editFeed(this.getParent().currentTarget.getAttribute("data-feed-id"));
			}
		}));

		menu.startup();
	}
}

function cache_set(id, obj) {
	//console.log("cache_set: " + id);
	if (has_storage)
		try {
			sessionStorage[id] = obj;
		} catch (e) {
			sessionStorage.clear();
		}
}

function cache_get(id) {
	if (has_storage)
		return sessionStorage[id];
}

function cache_clear() {
	if (has_storage)
		sessionStorage.clear();
}

function cache_delete(id) {
	if (has_storage)
		sessionStorage.removeItem(id);
}

function cancelSearch() {
	_search_query = "";
	viewCurrentFeed();
}

function setSelectionScore() {
	var ids = getSelectedArticleIds2();

	if (ids.length > 0) {
		console.log(ids);

		var score = prompt(__("Please enter new score for selected articles:"), score);

		if (score != undefined) {
			var query = "op=article&method=setScore&id=" + param_escape(ids.toString()) +
				"&score=" + param_escape(score);

			new Ajax.Request("backend.php", {
				parameters: query,
				onComplete: function (transport) {
					var reply = JSON.parse(transport.responseText);
					if (reply) {
						console.log(ids);

						ids.each(function (id) {
							var row = $("RROW-" + id);

							if (row) {
								var pic = row.getElementsByClassName("hlScorePic")[0];

								if (pic) {
									pic.src = pic.src.replace(/score_.*?\.png/,
										reply["score_pic"]);
									pic.setAttribute("score", score);
								}
							}
						});
					}
				}
			});
		}

	} else {
		alert(__("No articles are selected."));
	}
}

function updateScore(id) {
	var pic = $$("#RROW-" + id + " .hlScorePic")[0];

	if (pic) {

		var query = "op=article&method=getScore&id=" + param_escape(id);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function (transport) {
				console.log(transport.responseText);

				var reply = JSON.parse(transport.responseText);

				if (reply) {
					pic.src = pic.src.replace(/score_.*?\.png/, reply["score_pic"]);
					pic.setAttribute("score", reply["score"]);
					pic.setAttribute("title", reply["score"]);
				}
			}
		});
	}
}

function changeScore(id, pic) {
	var score = pic.getAttribute("score");

	var new_score = prompt(__("Please enter new score for this article:"), score);

	if (new_score != undefined) {

		var query = "op=article&method=setScore&id=" + param_escape(id) +
			"&score=" + param_escape(new_score);

		new Ajax.Request("backend.php", {
			parameters: query,
			onComplete: function (transport) {
				var reply = JSON.parse(transport.responseText);

				if (reply) {
					pic.src = pic.src.replace(/score_.*?\.png/, reply["score_pic"]);
					pic.setAttribute("score", new_score);
					pic.setAttribute("title", new_score);
				}
			}
		});
	}
}

function displayArticleUrl(id) {
	var query = "op=rpc&method=getlinktitlebyid&id=" + param_escape(id);

	new Ajax.Request("backend.php", {
		parameters: query,
		onComplete: function (transport) {
			var reply = JSON.parse(transport.responseText);

			if (reply && reply.link) {
				prompt(__("Article URL:"), reply.link);
			}
		}
	});
}

function scrollToRowId(id) {
	var row = $(id);

	if (row)
		$("headlines-frame").scrollTop = row.offsetTop - 4;
}

function updateFloatingTitle(unread_only) {
	if (!isCdmMode()) return;

	var hf = $("headlines-frame");

	var elems = $$("#headlines-frame > div[id*=RROW]");

	for (var i = 0; i < elems.length; i++) {

		var child = elems[i];

		if (child && child.offsetTop + child.offsetHeight > hf.scrollTop) {

			var header = child.getElementsByClassName("cdmHeader")[0];

			if (unread_only || child.getAttribute("data-article-id") != $("floatingTitle").getAttribute("data-article-id")) {
				if (child.getAttribute("data-article-id") != $("floatingTitle").getAttribute("data-article-id")) {

					$("floatingTitle").setAttribute("data-article-id", child.getAttribute("data-article-id"));
					$("floatingTitle").innerHTML = header.innerHTML;
					$("floatingTitle").firstChild.innerHTML = "<img class='anchor markedPic' src='images/page_white_go.png' onclick=\"scrollToRowId('" + child.id + "')\">" + $("floatingTitle").firstChild.innerHTML;

					initFloatingMenu();

					var cb = $$("#floatingTitle .dijitCheckBox")[0];

					if (cb)
						cb.parentNode.removeChild(cb);
				}

				if (child.hasClassName("Unread"))
					$("floatingTitle").addClassName("Unread");
				else
					$("floatingTitle").removeClassName("Unread");

				PluginHost.run(PluginHost.HOOK_FLOATING_TITLE, child);
			}

			$("floatingTitle").style.marginRight = hf.offsetWidth - child.offsetWidth + "px";
			if (header.offsetTop + header.offsetHeight < hf.scrollTop + $("floatingTitle").offsetHeight - 5 &&
				child.offsetTop + child.offsetHeight >= hf.scrollTop + $("floatingTitle").offsetHeight - 5)
				$("floatingTitle").style.visibility = "visible";
			else
				$("floatingTitle").style.visibility = "hidden";

			return;

		}
	}
}

function catchupCurrentBatchIfNeeded() {
	if (catchup_id_batch.length > 0) {
		window.clearTimeout(catchup_timeout_id);
		catchup_timeout_id = window.setTimeout(catchupBatchedArticles, 1000);

		if (catchup_id_batch.length >= 10) {
			catchupBatchedArticles();
		}
	}
}

function cdmFooterClick(event) {
	event.stopPropagation();
}
