require(["dojo/_base/declare", "dojo/data/ItemFileWriteStore"], function (declare) {

	return declare("fox.PrefFilterStore", dojo.data.ItemFileWriteStore, {

		_saveEverything: function (saveCompleteCallback, saveFailedCallback,
								   newFileContentString) {

			dojo.xhrPost({
				url: "backend.php",
				content: {
					op: "pref-filters", method: "savefilterorder",
					payload: newFileContentString
				},
				error: saveFailedCallback,
				load: saveCompleteCallback
			});
		},

	});
});

require(["dojo/_base/declare", "dojo/dom-construct", "lib/CheckBoxTree"], function (declare, domConstruct) {

	return declare("fox.PrefFilterTree", lib.CheckBoxTree, {
		_createTreeNode: function(args) {
			var tnode = this.inherited(arguments);

			var enabled = this.model.store.getValue(args.item, 'enabled');
			var param = this.model.store.getValue(args.item, 'param');
			var rules = this.model.store.getValue(args.item, 'rules');

			if (param) {
				param = dojo.doc.createElement('span');
				param.className = (enabled != false) ? 'labelParam' : 'labelParam filterDisabled';
				param.innerHTML = args.item.param[0];
				domConstruct.place(param, tnode.rowNode, 'first');
			}

			if (rules) {
				param = dojo.doc.createElement('span');
				param.className = 'filterRules';
				param.innerHTML = rules;
				domConstruct.place(param, tnode.rowNode, 'next');
			}

			if (this.model.store.getValue(args.item, 'id') != 'root') {
				var img = dojo.doc.createElement('img');
				img.src ='images/filter.png';
				img.className = 'markedPic';
				tnode._filterIconNode = img;
				domConstruct.place(tnode._filterIconNode, tnode.labelNode, 'before');
			}

			return tnode;
		},

		getLabel: function(item) {
			var label = item.name;

			var feed = this.model.store.getValue(item, 'feed');
			var inverse = this.model.store.getValue(item, 'inverse');

			if (feed)
				label += " (" + __("in") + " " + feed + ")";

			if (inverse)
				label += " (" + __("Inverse") + ")";

			/*		if (item.param)
			 label = "<span class=\"labelFixedLength\">" + label +
			 "</span>" + item.param[0]; */

			return label;
		},
		getIconClass: function (item, opened) {
			return (!item || this.model.mayHaveChildren(item)) ? (opened ? "dijitFolderOpened" : "dijitFolderClosed") : "invisible";
		},
		getLabelClass: function (item, opened) {
			var enabled = this.model.store.getValue(item, 'enabled');
			return (enabled != false) ? "dijitTreeLabel labelFixedLength" : "dijitTreeLabel labelFixedLength filterDisabled";
		},
		getRowClass: function (item, opened) {
			return (!item.error || item.error == '') ? "dijitTreeRow" :
				"dijitTreeRow Error";
		},
		checkItemAcceptance: function(target, source, position) {
			var item = dijit.getEnclosingWidget(target).item;

			// disable copying items
			source.copyState = function() { return false; };

			return position != 'over';
		},
		onDndDrop: function() {
			this.inherited(arguments);
			this.tree.model.store.save();
		},
	});

});


