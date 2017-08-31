require(["dojo/_base/declare", "dojo/data/ItemFileWriteStore"], function (declare) {

	return declare("fox.PrefFeedStore", dojo.data.ItemFileWriteStore, {

		_saveEverything: function(saveCompleteCallback, saveFailedCallback,
								  newFileContentString) {

			dojo.xhrPost({
				url: "backend.php",
				content: {op: "pref-feeds", method: "savefeedorder",
					payload: newFileContentString},
				error: saveFailedCallback,
				load: saveCompleteCallback});
		},

	});

});

require(["dojo/_base/declare", "dojo/dom-construct", "lib/CheckBoxTree"], function (declare, domConstruct) {

	return declare("fox.PrefFeedTree", lib.CheckBoxTree, {
		_createTreeNode: function(args) {
			var tnode = this.inherited(arguments);

			var icon = dojo.doc.createElement('img');
			if (args.item.icon && args.item.icon[0]) {
				icon.src = args.item.icon[0];
			} else {
				icon.src = 'images/blank_icon.gif';
			}
			icon.className = 'tinyFeedIcon';
			domConstruct.place(icon, tnode.iconNode, 'only');

			var param = this.model.store.getValue(args.item, 'param');

			if (param) {
				param = dojo.doc.createElement('span');
				param.className = 'feedParam';
				param.innerHTML = args.item.param[0];
				//domConstruct.place(param, tnode.labelNode, 'after');
				domConstruct.place(param, tnode.rowNode, 'first');
			}

			var id = args.item.id[0];
			var bare_id = parseInt(id.substr(id.indexOf(':')+1));

			if (id.match("CAT:") && bare_id > 0) {
				var menu = new dijit.Menu();
				menu.row_id = bare_id;
				menu.item = args.item;

				menu.addChild(new dijit.MenuItem({
					label: __("Edit category"),
					onClick: function() {
						editCat(this.getParent().row_id, this.getParent().item, null);
					}}));


				menu.addChild(new dijit.MenuItem({
					label: __("Remove category"),
					onClick: function() {
						removeCategory(this.getParent().row_id, this.getParent().item);
					}}));

				menu.bindDomNode(tnode.domNode);
				tnode._menu = menu;
			} else if (id.match("FEED:")) {
				var menu = new dijit.Menu();
				menu.row_id = bare_id;
				menu.item = args.item;

				menu.addChild(new dijit.MenuItem({
					label: __("Edit feed"),
					onClick: function() {
						editFeed(this.getParent().row_id);
					}}));

				menu.addChild(new dijit.MenuItem({
					label: __("Unsubscribe"),
					onClick: function() {
						unsubscribeFeed(this.getParent().row_id, this.getParent().item.name);
					}}));

				menu.bindDomNode(tnode.domNode);
				tnode._menu = menu;

			}

			return tnode;
		},
		onDndDrop: function() {
			this.inherited(arguments);
			this.tree.model.store.save();
		},
		getRowClass: function (item, opened) {
			return (!item.error || item.error == '') ? "dijitTreeRow" :
				"dijitTreeRow Error";
		},
		getIconClass: function (item, opened) {
			return (!item || this.model.store.getValue(item, 'type') == 'category') ? (opened ? "dijitFolderOpened" : "dijitFolderClosed") : "feedIcon";
		},
		checkItemAcceptance: function(target, source, position) {
			var item = dijit.getEnclosingWidget(target).item;

			// disable copying items
			source.copyState = function() { return false; };

			var source_item = false;

			source.forInSelectedItems(function(node) {
				source_item = node.data.item;
			});

			if (!source_item || !item) return false;

			var id = this.tree.model.store.getValue(item, 'id');
			var source_id = source.tree.model.store.getValue(source_item, 'id');

			//console.log(id + " " + position + " " + source_id);

			if (source_id.match("FEED:")) {
				return ((id.match("CAT:") && position == "over") ||
				(id.match("FEED:") && position != "over"));
			} else if (source_id.match("CAT:")) {
				return ((id.match("CAT:") && !id.match("CAT:0")) ||
				(id.match("root") && position == "over"));
			}
		},
	});
});

