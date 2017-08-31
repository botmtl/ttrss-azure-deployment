<?php
class Article extends Handler_Protected {

	function csrf_ignore($method) {
		$csrf_ignored = array("redirect", "editarticletags");

		return array_search($method, $csrf_ignored) !== false;
	}

	function redirect() {
		$id = $this->dbh->escape_string($_REQUEST['id']);

		$result = $this->dbh->query("SELECT link FROM ttrss_entries, ttrss_user_entries
						WHERE id = '$id' AND id = ref_id AND owner_uid = '".$_SESSION['uid']."'
						LIMIT 1");

		if ($this->dbh->num_rows($result) == 1) {
			$article_url = $this->dbh->fetch_result($result, 0, 'link');
			$article_url = str_replace("\n", "", $article_url);

			header("Location: $article_url");
			return;

		} else {
			print_error(__("Article not found."));
		}
	}

	function view() {
		$id = $this->dbh->escape_string($_REQUEST["id"]);
		$cids = explode(",", $this->dbh->escape_string($_REQUEST["cids"]));
		$mode = $this->dbh->escape_string($_REQUEST["mode"]);

		// in prefetch mode we only output requested cids, main article
		// just gets marked as read (it already exists in client cache)

		$articles = array();

		if ($mode == "") {
			array_push($articles, $this->format_article($id, false));
		} else if ($mode == "zoom") {
			array_push($articles, $this->format_article($id, true, true));
		} else if ($mode == "raw") {
			if (isset($_REQUEST['html'])) {
				header("Content-Type: text/html");
				print '<link rel="stylesheet" type="text/css" href="css/tt-rss.css"/>';
			}

			$article = $this->format_article($id, false, isset($_REQUEST["zoom"]));
			print $article['content'];
			return;
		}

		$this->catchupArticleById($id, 0);

		if (!$_SESSION["bw_limit"]) {
			foreach ($cids as $cid) {
				if ($cid) {
					array_push($articles, $this->format_article($cid, false, false));
				}
			}
		}

		print json_encode($articles);
	}

	private function catchupArticleById($id, $cmode) {

		if ($cmode == 0) {
			$this->dbh->query("UPDATE ttrss_user_entries SET
			unread = false,last_read = NOW()
			WHERE ref_id = '$id' AND owner_uid = " . $_SESSION["uid"]);
		} else if ($cmode == 1) {
			$this->dbh->query("UPDATE ttrss_user_entries SET
			unread = true
			WHERE ref_id = '$id' AND owner_uid = " . $_SESSION["uid"]);
		} else {
			$this->dbh->query("UPDATE ttrss_user_entries SET
			unread = NOT unread,last_read = NOW()
			WHERE ref_id = '$id' AND owner_uid = " . $_SESSION["uid"]);
		}

		$feed_id = $this->getArticleFeed($id);
		CCache::update($feed_id, $_SESSION["uid"]);
	}

	static function create_published_article($title, $url, $content, $labels_str,
			$owner_uid) {

		$guid = 'SHA1:' . sha1("ttshared:" . $url . $owner_uid); // include owner_uid to prevent global GUID clash

		if (!$content) {
			$pluginhost = new PluginHost();
			$pluginhost->load_all(PluginHost::KIND_ALL, $owner_uid);
			$pluginhost->load_data();

			$af_readability = $pluginhost->get_plugin("Af_Readability");

			if ($af_readability) {
				$enable_share_anything = $pluginhost->get($af_readability, "enable_share_anything");

				if ($enable_share_anything) {
					$extracted_content = $af_readability->extract_content($url);

					if ($extracted_content) $content = db_escape_string($extracted_content);
				}
			}
		}

		$content_hash = sha1($content);

		if ($labels_str != "") {
			$labels = explode(",", $labels_str);
		} else {
			$labels = array();
		}

		$rc = false;

		if (!$title) $title = $url;
		if (!$title && !$url) return false;

		if (filter_var($url, FILTER_VALIDATE_URL) === FALSE) return false;

		db_query("BEGIN");

		// only check for our user data here, others might have shared this with different content etc
		$result = db_query("SELECT id FROM ttrss_entries, ttrss_user_entries WHERE
			guid = '$guid' AND ref_id = id AND owner_uid = '$owner_uid' LIMIT 1");

		if (db_num_rows($result) != 0) {
			$ref_id = db_fetch_result($result, 0, "id");

			$result = db_query("SELECT int_id FROM ttrss_user_entries WHERE
				ref_id = '$ref_id' AND owner_uid = '$owner_uid' LIMIT 1");

			if (db_num_rows($result) != 0) {
				$int_id = db_fetch_result($result, 0, "int_id");

				db_query("UPDATE ttrss_entries SET
					content = '$content', content_hash = '$content_hash' WHERE id = '$ref_id'");

				db_query("UPDATE ttrss_user_entries SET published = true,
						last_published = NOW() WHERE
						int_id = '$int_id' AND owner_uid = '$owner_uid'");
			} else {

				db_query("INSERT INTO ttrss_user_entries
					(ref_id, uuid, feed_id, orig_feed_id, owner_uid, published, tag_cache, label_cache,
						last_read, note, unread, last_published)
					VALUES
					('$ref_id', '', NULL, NULL, $owner_uid, true, '', '', NOW(), '', false, NOW())");
			}

			if (count($labels) != 0) {
				foreach ($labels as $label) {
					Labels::add_article($ref_id, trim($label), $owner_uid);
				}
			}

			$rc = true;

		} else {
			$result = db_query("INSERT INTO ttrss_entries
				(title, guid, link, updated, content, content_hash, date_entered, date_updated)
				VALUES
				('$title', '$guid', '$url', NOW(), '$content', '$content_hash', NOW(), NOW())");

			$result = db_query("SELECT id FROM ttrss_entries WHERE guid = '$guid'");

			if (db_num_rows($result) != 0) {
				$ref_id = db_fetch_result($result, 0, "id");

				db_query("INSERT INTO ttrss_user_entries
					(ref_id, uuid, feed_id, orig_feed_id, owner_uid, published, tag_cache, label_cache,
						last_read, note, unread, last_published)
					VALUES
					('$ref_id', '', NULL, NULL, $owner_uid, true, '', '', NOW(), '', false, NOW())");

				if (count($labels) != 0) {
					foreach ($labels as $label) {
						Labels::add_article($ref_id, trim($label), $owner_uid);
					}
				}

				$rc = true;
			}
		}

		db_query("COMMIT");

		return $rc;
	}

	function editArticleTags() {

		print __("Tags for this article (separated by commas):")."<br>";

		$param = $this->dbh->escape_string($_REQUEST['param']);

		$tags = Article::get_article_tags($this->dbh->escape_string($param));

		$tags_str = join(", ", $tags);

		print_hidden("id", "$param");
		print_hidden("op", "article");
		print_hidden("method", "setArticleTags");

		print "<table width='100%'><tr><td>";

		print "<textarea dojoType=\"dijit.form.SimpleTextarea\" rows='4'
			style='height : 100px; font-size : 12px; width : 98%' id=\"tags_str\"
			name='tags_str'>$tags_str</textarea>
		<div class=\"autocomplete\" id=\"tags_choices\"
				style=\"display:none\"></div>";

		print "</td></tr></table>";

		print "<div class='dlgButtons'>";

		print "<button dojoType=\"dijit.form.Button\"
			onclick=\"dijit.byId('editTagsDlg').execute()\">".__('Save')."</button> ";
		print "<button dojoType=\"dijit.form.Button\"
			onclick=\"dijit.byId('editTagsDlg').hide()\">".__('Cancel')."</button>";
		print "</div>";

	}

	function setScore() {
		$ids = $this->dbh->escape_string($_REQUEST['id']);
		$score = (int)$this->dbh->escape_string($_REQUEST['score']);

		$this->dbh->query("UPDATE ttrss_user_entries SET
			score = '$score' WHERE ref_id IN ($ids) AND owner_uid = " . $_SESSION["uid"]);

		print json_encode(array("id" => $ids,
			"score" => (int)$score,
			"score_pic" => get_score_pic($score)));
	}

	function getScore() {
		$id = $this->dbh->escape_string($_REQUEST['id']);

		$result = $this->dbh->query("SELECT score FROM ttrss_user_entries WHERE ref_id = $id AND owner_uid = " . $_SESSION["uid"]);
		$score = $this->dbh->fetch_result($result, 0, "score");

		print json_encode(array("id" => $id,
			"score" => (int)$score,
			"score_pic" => get_score_pic($score)));
	}


	function setArticleTags() {

		$id = $this->dbh->escape_string($_REQUEST["id"]);

		$tags_str = $this->dbh->escape_string($_REQUEST["tags_str"]);
		$tags = array_unique(trim_array(explode(",", $tags_str)));

		$this->dbh->query("BEGIN");

		$result = $this->dbh->query("SELECT int_id FROM ttrss_user_entries WHERE
				ref_id = '$id' AND owner_uid = '".$_SESSION["uid"]."' LIMIT 1");

		if ($this->dbh->num_rows($result) == 1) {

			$tags_to_cache = array();

			$int_id = $this->dbh->fetch_result($result, 0, "int_id");

			$this->dbh->query("DELETE FROM ttrss_tags WHERE
				post_int_id = $int_id AND owner_uid = '".$_SESSION["uid"]."'");

			foreach ($tags as $tag) {
				$tag = sanitize_tag($tag);

				if (!tag_is_valid($tag)) {
					continue;
				}

				if (preg_match("/^[0-9]*$/", $tag)) {
					continue;
				}

				//					print "<!-- $id : $int_id : $tag -->";

				if ($tag != '') {
					$this->dbh->query("INSERT INTO ttrss_tags
								(post_int_id, owner_uid, tag_name) VALUES ('$int_id', '".$_SESSION["uid"]."', '$tag')");
				}

				array_push($tags_to_cache, $tag);
			}

			/* update tag cache */

			sort($tags_to_cache);
			$tags_str = join(",", $tags_to_cache);

			$this->dbh->query("UPDATE ttrss_user_entries
				SET tag_cache = '$tags_str' WHERE ref_id = '$id'
						AND owner_uid = " . $_SESSION["uid"]);
		}

		$this->dbh->query("COMMIT");

		$tags = Article::get_article_tags($id);
		$tags_str = $this->format_tags_string($tags, $id);
		$tags_str_full = join(", ", $tags);

		if (!$tags_str_full) $tags_str_full = __("no tags");

		print json_encode(array("id" => (int)$id,
				"content" => $tags_str, "content_full" => $tags_str_full));
	}


	function completeTags() {
		$search = $this->dbh->escape_string($_REQUEST["search"]);

		$result = $this->dbh->query("SELECT DISTINCT tag_name FROM ttrss_tags
				WHERE owner_uid = '".$_SESSION["uid"]."' AND
				tag_name LIKE '$search%' ORDER BY tag_name
				LIMIT 10");

		print "<ul>";
		while ($line = $this->dbh->fetch_assoc($result)) {
			print "<li>" . $line["tag_name"] . "</li>";
		}
		print "</ul>";
	}

	function assigntolabel() {
		return $this->labelops(true);
	}

	function removefromlabel() {
		return $this->labelops(false);
	}

	private function labelops($assign) {
		$reply = array();

		$ids = explode(",", $this->dbh->escape_string($_REQUEST["ids"]));
		$label_id = $this->dbh->escape_string($_REQUEST["lid"]);

		$label = $this->dbh->escape_string(Labels::find_caption($label_id,
		$_SESSION["uid"]));

		$reply["info-for-headlines"] = array();

		if ($label) {

			foreach ($ids as $id) {

				if ($assign)
					Labels::add_article($id, $label, $_SESSION["uid"]);
				else
					Labels::remove_article($id, $label, $_SESSION["uid"]);

				$labels = $this->get_article_labels($id, $_SESSION["uid"]);

				array_push($reply["info-for-headlines"],
				array("id" => $id, "labels" => $this->format_article_labels($labels)));

			}
		}

		$reply["message"] = "UPDATE_COUNTERS";

		print json_encode($reply);
	}

	function getArticleFeed($id) {
		$result = db_query("SELECT feed_id FROM ttrss_user_entries
			WHERE ref_id = '$id' AND owner_uid = " . $_SESSION["uid"]);

		if (db_num_rows($result) != 0) {
			return db_fetch_result($result, 0, "feed_id");
		} else {
			return 0;
		}
	}

	static function format_article_enclosures($id, $always_display_enclosures,
									   $article_content, $hide_images = false) {

		$result = Article::get_article_enclosures($id);
		$rv = '';

		foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_FORMAT_ENCLOSURES) as $plugin) {
			$retval = $plugin->hook_format_enclosures($rv, $result, $id, $always_display_enclosures, $article_content, $hide_images);
			if (is_array($retval)) {
				$rv = $retval[0];
				$result = $retval[1];
			} else {
				$rv = $retval;
			}
		}
		unset($retval); // Unset to prevent breaking render if there are no HOOK_RENDER_ENCLOSURE hooks below.

		if ($rv === '' && !empty($result)) {
			$entries_html = array();
			$entries = array();
			$entries_inline = array();

			foreach ($result as $line) {

				foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_ENCLOSURE_ENTRY) as $plugin) {
					$line = $plugin->hook_enclosure_entry($line);
				}

				$url = $line["content_url"];
				$ctype = $line["content_type"];
				$title = $line["title"];
				$width = $line["width"];
				$height = $line["height"];

				if (!$ctype) $ctype = __("unknown type");

				//$filename = substr($url, strrpos($url, "/")+1);
				$filename = basename($url);

				$player = format_inline_player($url, $ctype);

				if ($player) array_push($entries_inline, $player);

#				$entry .= " <a target=\"_blank\" href=\"" . htmlspecialchars($url) . "\" rel=\"noopener noreferrer\">" .
#					$filename . " (" . $ctype . ")" . "</a>";

				$entry = "<div onclick=\"openUrlPopup('".htmlspecialchars($url)."')\"
					dojoType=\"dijit.MenuItem\">$filename ($ctype)</div>";

				array_push($entries_html, $entry);

				$entry = array();

				$entry["type"] = $ctype;
				$entry["filename"] = $filename;
				$entry["url"] = $url;
				$entry["title"] = $title;
				$entry["width"] = $width;
				$entry["height"] = $height;

				array_push($entries, $entry);
			}

			if ($_SESSION['uid'] && !get_pref("STRIP_IMAGES") && !$_SESSION["bw_limit"]) {
				if ($always_display_enclosures ||
					!preg_match("/<img/i", $article_content)) {

					foreach ($entries as $entry) {

						foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_RENDER_ENCLOSURE) as $plugin)
							$retval = $plugin->hook_render_enclosure($entry, $hide_images);


						if ($retval) {
							$rv .= $retval;
						} else {

							if (preg_match("/image/", $entry["type"])) {

								if (!$hide_images) {
									$encsize = '';
									if ($entry['height'] > 0)
										$encsize .= ' height="' . intval($entry['height']) . '"';
									if ($entry['width'] > 0)
										$encsize .= ' width="' . intval($entry['width']) . '"';
									$rv .= "<p><img
										alt=\"".htmlspecialchars($entry["filename"])."\"
										src=\"" .htmlspecialchars($entry["url"]) . "\"
										" . $encsize . " /></p>";
								} else {
									$rv .= "<p><a target=\"_blank\" rel=\"noopener noreferrer\"
										href=\"".htmlspecialchars($entry["url"])."\"
										>" .htmlspecialchars($entry["url"]) . "</a></p>";
								}

								if ($entry['title']) {
									$rv.= "<div class=\"enclosure_title\">${entry['title']}</div>";
								}
							}
						}
					}
				}
			}

			if (count($entries_inline) > 0) {
				$rv .= "<hr clear='both'/>";
				foreach ($entries_inline as $entry) { $rv .= $entry; };
				$rv .= "<hr clear='both'/>";
			}

			$rv .= "<div class=\"attachments\" dojoType=\"dijit.form.DropDownButton\">".
				"<span>" . __('Attachments')."</span>";

			$rv .= "<div dojoType=\"dijit.Menu\" style=\"display: none;\">";

			foreach ($entries as $entry) {
				if ($entry["title"])
					$title = " &mdash; " . truncate_string($entry["title"], 30);
				else
					$title = "";

				if ($entry["filename"])
					$filename = truncate_middle(htmlspecialchars($entry["filename"]), 60);
				else
					$filename = "";

				$rv .= "<div onclick='openUrlPopup(\"".htmlspecialchars($entry["url"])."\")'
					dojoType=\"dijit.MenuItem\">".$filename . $title."</div>";

			};

			$rv .= "</div>";
			$rv .= "</div>";
		}

		return $rv;
	}

	static function format_article($id, $mark_as_read = true, $zoom_mode = false, $owner_uid = false) {
		if (!$owner_uid) $owner_uid = $_SESSION["uid"];

		$rv = array();

		$rv['id'] = $id;

		/* we can figure out feed_id from article id anyway, why do we
		 * pass feed_id here? let's ignore the argument :(*/

		$result = db_query("SELECT feed_id FROM ttrss_user_entries
			WHERE ref_id = '$id'");

		$feed_id = (int) db_fetch_result($result, 0, "feed_id");

		$rv['feed_id'] = $feed_id;

		//if (!$zoom_mode) { print "<article id='$id'><![CDATA["; };

		if ($mark_as_read) {
			$result = db_query("UPDATE ttrss_user_entries
				SET unread = false,last_read = NOW()
				WHERE ref_id = '$id' AND owner_uid = $owner_uid");

			CCache::update($feed_id, $owner_uid);
		}

		$result = db_query("SELECT id,title,link,content,feed_id,comments,int_id,lang,
			".SUBSTRING_FOR_DATE."(updated,1,16) as updated,
			(SELECT site_url FROM ttrss_feeds WHERE id = feed_id) as site_url,
			(SELECT title FROM ttrss_feeds WHERE id = feed_id) as feed_title,
			(SELECT hide_images FROM ttrss_feeds WHERE id = feed_id) as hide_images,
			(SELECT always_display_enclosures FROM ttrss_feeds WHERE id = feed_id) as always_display_enclosures,
			num_comments,
			tag_cache,
			author,
			guid,
			orig_feed_id,
			note
			FROM ttrss_entries,ttrss_user_entries
			WHERE	id = '$id' AND ref_id = id AND owner_uid = $owner_uid");

		if ($result) {

			$line = db_fetch_assoc($result);

			$line["tags"] = Article::get_article_tags($id, $owner_uid, $line["tag_cache"]);
			unset($line["tag_cache"]);

			$line["content"] = sanitize($line["content"],
				sql_bool_to_bool($line['hide_images']),
				$owner_uid, $line["site_url"], false, $line["id"]);

			foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_RENDER_ARTICLE) as $p) {
				$line = $p->hook_render_article($line);
			}

			$num_comments = (int) $line["num_comments"];
			$entry_comments = "";

			if ($num_comments > 0) {
				if ($line["comments"]) {
					$comments_url = htmlspecialchars($line["comments"]);
				} else {
					$comments_url = htmlspecialchars($line["link"]);
				}
				$entry_comments = "<a class=\"postComments\"
					target='_blank' rel=\"noopener noreferrer\" href=\"$comments_url\">$num_comments ".
					_ngettext("comment", "comments", $num_comments)."</a>";

			} else {
				if ($line["comments"] && $line["link"] != $line["comments"]) {
					$entry_comments = "<a class=\"postComments\" target='_blank' rel=\"noopener noreferrer\" href=\"".htmlspecialchars($line["comments"])."\">".__("comments")."</a>";
				}
			}

			if ($zoom_mode) {
				header("Content-Type: text/html");
				$rv['content'] .= "<html><head>
						<meta http-equiv=\"Content-Type\" content=\"text/html; charset=utf-8\"/>
						<title>".$line["title"]."</title>".
					stylesheet_tag("css/tt-rss.css").
					stylesheet_tag("css/zoom.css").
					stylesheet_tag("css/dijit.css")."

						<link rel=\"shortcut icon\" type=\"image/png\" href=\"images/favicon.png\">
						<link rel=\"icon\" type=\"image/png\" sizes=\"72x72\" href=\"images/favicon-72px.png\">

					</head><body id=\"ttrssZoom\">";
			}

			$rv['content'] .= "<div class=\"postReply\" id=\"POST-$id\">";

			$rv['content'] .= "<div class=\"postHeader\" id=\"POSTHDR-$id\">";

			$entry_author = $line["author"];

			if ($entry_author) {
				$entry_author = __(" - ") . $entry_author;
			}

			$parsed_updated = make_local_datetime($line["updated"], true,
				$owner_uid, true);

			if (!$zoom_mode)
				$rv['content'] .= "<div class=\"postDate\">$parsed_updated</div>";

			if ($line["link"]) {
				$rv['content'] .= "<div class='postTitle'><a target='_blank' rel='noopener noreferrer'
					title=\"".htmlspecialchars($line['title'])."\"
					href=\"" .
					htmlspecialchars($line["link"]) . "\">" .
					$line["title"] . "</a>" .
					"<span class='author'>$entry_author</span></div>";
			} else {
				$rv['content'] .= "<div class='postTitle'>" . $line["title"] . "$entry_author</div>";
			}

			if ($zoom_mode) {
				$feed_title = htmlspecialchars($line["feed_title"]);

				$rv['content'] .= "<div class=\"postFeedTitle\">$feed_title</div>";

				$rv['content'] .= "<div class=\"postDate\">$parsed_updated</div>";
			}

			$tags_str = Article::format_tags_string($line["tags"], $id);
			$tags_str_full = join(", ", $line["tags"]);

			if (!$tags_str_full) $tags_str_full = __("no tags");

			if (!$entry_comments) $entry_comments = "&nbsp;"; # placeholder

			$rv['content'] .= "<div class='postTags' style='float : right'>
				<img src='images/tag.png'
				class='tagsPic' alt='Tags' title='Tags'>&nbsp;";

			if (!$zoom_mode) {
				$rv['content'] .= "<span id=\"ATSTR-$id\">$tags_str</span>
					<a title=\"".__('Edit tags for this article')."\"
					href=\"#\" onclick=\"editArticleTags($id, $feed_id)\">(+)</a>";

				$rv['content'] .= "<div dojoType=\"dijit.Tooltip\"
					id=\"ATSTRTIP-$id\" connectId=\"ATSTR-$id\"
					position=\"below\">$tags_str_full</div>";

				foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_ARTICLE_BUTTON) as $p) {
					$rv['content'] .= $p->hook_article_button($line);
				}

			} else {
				$tags_str = strip_tags($tags_str);
				$rv['content'] .= "<span id=\"ATSTR-$id\">$tags_str</span>";
			}
			$rv['content'] .= "</div>";
			$rv['content'] .= "<div clear='both'>";

			foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_ARTICLE_LEFT_BUTTON) as $p) {
				$rv['content'] .= $p->hook_article_left_button($line);
			}

			$rv['content'] .= "$entry_comments</div>";

			if ($line["orig_feed_id"]) {

				$tmp_result = db_query("SELECT * FROM ttrss_archived_feeds
					WHERE id = ".$line["orig_feed_id"] . " AND owner_uid = " . $_SESSION["uid"]);

				if (db_num_rows($tmp_result) != 0) {

					$rv['content'] .= "<div clear='both'>";
					$rv['content'] .= __("Originally from:");

					$rv['content'] .= "&nbsp;";

					$tmp_line = db_fetch_assoc($tmp_result);

					$rv['content'] .= "<a target='_blank' rel='noopener noreferrer'
						href=' " . htmlspecialchars($tmp_line['site_url']) . "'>" .
						$tmp_line['title'] . "</a>";

					$rv['content'] .= "&nbsp;";

					$rv['content'] .= "<a target='_blank' rel='noopener noreferrer' href='" . htmlspecialchars($tmp_line['feed_url']) . "'>";
					$rv['content'] .= "<img title='".__('Feed URL')."' class='tinyFeedIcon' src='images/pub_set.png'></a>";

					$rv['content'] .= "</div>";
				}
			}

			$rv['content'] .= "</div>";

			$rv['content'] .= "<div id=\"POSTNOTE-$id\">";
			if ($line['note']) {
				$rv['content'] .= Article::format_article_note($id, $line['note'], !$zoom_mode);
			}
			$rv['content'] .= "</div>";

			if (!$line['lang']) $line['lang'] = 'en';

			$rv['content'] .= "<div class=\"postContent\" lang=\"".$line['lang']."\">";

			$rv['content'] .= $line["content"];

			if (!$zoom_mode) {
				$rv['content'] .= Article::format_article_enclosures($id,
					sql_bool_to_bool($line["always_display_enclosures"]),
					$line["content"],
					sql_bool_to_bool($line["hide_images"]));
			}

			$rv['content'] .= "</div>";

			$rv['content'] .= "</div>";

		}

		if ($zoom_mode) {
			$rv['content'] .= "
				<div class='footer'>
				<button onclick=\"return window.close()\">".
				__("Close this window")."</button></div>";
			$rv['content'] .= "</body></html>";
		}

		foreach (PluginHost::getInstance()->get_hooks(PluginHost::HOOK_FORMAT_ARTICLE) as $p) {
			$rv['content'] = $p->hook_format_article($rv['content'], $line, $zoom_mode);
		}

		return $rv;

	}

	static function get_article_tags($id, $owner_uid = 0, $tag_cache = false) {

		$a_id = db_escape_string($id);

		if (!$owner_uid) $owner_uid = $_SESSION["uid"];

		$query = "SELECT DISTINCT tag_name,
			owner_uid as owner FROM
			ttrss_tags WHERE post_int_id = (SELECT int_id FROM ttrss_user_entries WHERE
			ref_id = '$a_id' AND owner_uid = '$owner_uid' LIMIT 1) ORDER BY tag_name";

		$tags = array();

		/* check cache first */

		if ($tag_cache === false) {
			$result = db_query("SELECT tag_cache FROM ttrss_user_entries
				WHERE ref_id = '$id' AND owner_uid = $owner_uid");

			if (db_num_rows($result) != 0)
				$tag_cache = db_fetch_result($result, 0, "tag_cache");
		}

		if ($tag_cache) {
			$tags = explode(",", $tag_cache);
		} else {

			/* do it the hard way */

			$tmp_result = db_query($query);

			while ($tmp_line = db_fetch_assoc($tmp_result)) {
				array_push($tags, $tmp_line["tag_name"]);
			}

			/* update the cache */

			$tags_str = db_escape_string(join(",", $tags));

			db_query("UPDATE ttrss_user_entries
				SET tag_cache = '$tags_str' WHERE ref_id = '$id'
				AND owner_uid = $owner_uid");
		}

		return $tags;
	}

	static function format_tags_string($tags) {
		if (!is_array($tags) || count($tags) == 0) {
			return __("no tags");
		} else {
			$maxtags = min(5, count($tags));
			$tags_str = "";

			for ($i = 0; $i < $maxtags; $i++) {
				$tags_str .= "<a class=\"tag\" href=\"#\" onclick=\"viewfeed({feed:'".$tags[$i]."'})\">" . $tags[$i] . "</a>, ";
			}

			$tags_str = mb_substr($tags_str, 0, mb_strlen($tags_str)-2);

			if (count($tags) > $maxtags)
				$tags_str .= ", &hellip;";

			return $tags_str;
		}
	}

	static function format_article_labels($labels) {

		if (!is_array($labels)) return '';

		$labels_str = "";

		foreach ($labels as $l) {
			$labels_str .= sprintf("<span class='hlLabelRef'
				style='color : %s; background-color : %s'>%s</span>",
				$l[2], $l[3], $l[1]);
		}

		return $labels_str;

	}

	static function format_article_note($id, $note, $allow_edit = true) {

		$str = "<div class='articleNote'	onclick=\"editArticleNote($id)\">
			<div class='noteEdit' onclick=\"editArticleNote($id)\">".
			($allow_edit ? __('(edit note)') : "")."</div>$note</div>";

		return $str;
	}

	static function get_article_enclosures($id) {

		$query = "SELECT * FROM ttrss_enclosures
			WHERE post_id = '$id' AND content_url != ''";

		$rv = array();

		$result = db_query($query);

		if (db_num_rows($result) > 0) {
			while ($line = db_fetch_assoc($result)) {

				if (file_exists(CACHE_DIR . '/images/' . sha1($line["content_url"]))) {
					$line["content_url"] = get_self_url_prefix() . '/public.php?op=cached_url&hash=' . sha1($line["content_url"]);
				}

				array_push($rv, $line);
			}
		}

		return $rv;
	}

	static function purge_orphans($do_output = false) {

		// purge orphaned posts in main content table
		$result = db_query("DELETE FROM ttrss_entries WHERE
			NOT EXISTS (SELECT ref_id FROM ttrss_user_entries WHERE ref_id = id)");

		if ($do_output) {
			$rows = db_affected_rows($result);
			_debug("Purged $rows orphaned posts.");
		}
	}

	static function catchupArticlesById($ids, $cmode, $owner_uid = false) {

		if (!$owner_uid) $owner_uid = $_SESSION["uid"];
		if (count($ids) == 0) return;

		$tmp_ids = array();

		foreach ($ids as $id) {
			array_push($tmp_ids, "ref_id = '$id'");
		}

		$ids_qpart = join(" OR ", $tmp_ids);

		if ($cmode == 0) {
			db_query("UPDATE ttrss_user_entries SET
			unread = false,last_read = NOW()
			WHERE ($ids_qpart) AND owner_uid = $owner_uid");
		} else if ($cmode == 1) {
			db_query("UPDATE ttrss_user_entries SET
			unread = true
			WHERE ($ids_qpart) AND owner_uid = $owner_uid");
		} else {
			db_query("UPDATE ttrss_user_entries SET
			unread = NOT unread,last_read = NOW()
			WHERE ($ids_qpart) AND owner_uid = $owner_uid");
		}

		/* update ccache */

		$result = db_query("SELECT DISTINCT feed_id FROM ttrss_user_entries
			WHERE ($ids_qpart) AND owner_uid = $owner_uid");

		while ($line = db_fetch_assoc($result)) {
			CCache::update($line["feed_id"], $owner_uid);
		}
	}

	static function getLastArticleId() {
		$result = db_query("SELECT ref_id AS id FROM ttrss_user_entries
			WHERE owner_uid = " . $_SESSION["uid"] . " ORDER BY ref_id DESC LIMIT 1");

		if (db_num_rows($result) == 1) {
			return db_fetch_result($result, 0, "id");
		} else {
			return -1;
		}
	}

	static function get_article_labels($id, $owner_uid = false) {
		$rv = array();

		if (!$owner_uid) $owner_uid = $_SESSION["uid"];

		$result = db_query("SELECT label_cache FROM
			ttrss_user_entries WHERE ref_id = '$id' AND owner_uid = " .
			$owner_uid);

		if (db_num_rows($result) > 0) {
			$label_cache = db_fetch_result($result, 0, "label_cache");

			if ($label_cache) {
				$label_cache = json_decode($label_cache, true);

				if ($label_cache["no-labels"] == 1)
					return $rv;
				else
					return $label_cache;
			}
		}

		$result = db_query(
			"SELECT DISTINCT label_id,caption,fg_color,bg_color
				FROM ttrss_labels2, ttrss_user_labels2
			WHERE id = label_id
				AND article_id = '$id'
				AND owner_uid = ". $owner_uid . "
			ORDER BY caption");

		while ($line = db_fetch_assoc($result)) {
			$rk = array(Labels::label_to_feed_id($line["label_id"]),
				$line["caption"], $line["fg_color"],
				$line["bg_color"]);
			array_push($rv, $rk);
		}

		if (count($rv) > 0)
			Labels::update_cache($owner_uid, $id, $rv);
		else
			Labels::update_cache($owner_uid, $id, array("no-labels" => 1));

		return $rv;
	}

}
