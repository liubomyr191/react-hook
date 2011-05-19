/*!
 * React for JavaScript - an easy-rerender template language
 * Version 0.8.3, http://github.com/marcusphillips/react
 *
 * Copyright 2010, Marcus Phillips
 * Dual licensed under the MIT or GPL Version 2 licenses.
 */

(function () {

  var undefined;

  window.react = {

    nodes: {},

    scopes: {},

    _matchers: {
      directiveDelimiter: /\s*,\s*/,
      space: /\s+/,
      isString: /(^'.*'$)|(^".*"$)/,
      negation: /!\s*/,
      isNumber: /\d+/
    },

    name: function(name, object){
      this.scopes[name] = object;
    },

    getNodeKey: function(node){
      return (node.reactKey = node.reactKey || js.util.unique('reactNode'));
    },

    getScopeKey: function(object){
      return (object.reactKey = object.reactKey || js.util.unique('reactObject'));
    },

    getObjectKey: function(){
      throw new Error('This method is deprecated - please use getScopeKey() instead');
    },

    set: function(object, key, value){
      object[key] = value;
      this.changed(object, key);
    },

    changed: function(object, key){
      // if no key us supplied, check every key
      if(arguments.length < 2){
        for(key in object){
          this.changed(object, key);
        }
        return;
      }

      // if there are no observers for the supplied key, do nothing
      if(!object || !object.observers || !object.observers[key]){ return; }

      for(var listenerString in object.observers[key]){
        this._checkListener(object, key, listenerString);
      }
    },

    _checkListener: function(object, key, listenerString){
      var listener = this._interpretListenerString(listenerString);

      if(!this._listenerIsStillValid(listener, object, key)){ return; }

      // todo: bindItem is needed here but won't work until the registration is made on the array element it's bound to. something like
      js.errorIf(listener.directive[0] === 'bindItem', 'you need recalculations for bindItem (when the key was an itemAlias), but those aren\'t implemented yet');
      if(js.among(['within', 'withinEach', 'withinItem', 'for'], listener.directive[0])){
        // todo: loopKey probably won't work, and maybe withinEach either
        this._updateTree({
          node: listener.node,
          fromDirective: listener.directiveIndex
        });
        return;
      }

      this._followDirective(listener.directive, js.create(this.commands, {
        node: listener.node,
        scopeChain: listener.scopeChain,
        directiveIndex: listener.directiveIndex
      }));
    },

    _interpretListenerString: function(listenerString){
      var listener = listenerString.split(' ');
      var node = this.nodes[listener[0]];
      var directiveIndex = +listener[1];
      return{
        node: node,
        directiveIndex: directiveIndex,
        prefix: listener[2],
        directive: this._getDirectives(node)[directiveIndex],
        scopeChain: this._buildScopeChainForNode(node, directiveIndex)
      };
    },

    _listenerIsStillValid: function(listener, object, key){
      // ignore the object if it's not in the same path that lead to registration of a listener
      return object === this._lookupInScopeChain(listener.prefix+key, listener.scopeChain, {returnObject: true});
    },

    _buildScopeChainForNode: function(node, directiveIndex){
      var ancestors = $(Array.prototype.reverse.apply($(node).parents())).add(node);
      for(var whichAncestor = 0; whichAncestor < ancestors.length; whichAncestor++){
        var eachAncestor = ancestors[whichAncestor];
        var directives = this._getDirectives(eachAncestor);
        var lastLink = this._buildScopeChainFromAnchorNames(directives.anchored, lastLink);

        for(var whichDirective = 0; whichDirective < directives.length; whichDirective++){
          if(eachAncestor === node && (directiveIndex||0) <= whichDirective){ break; }
          if(!lastLink){ continue; }
          lastLink = this._extendScopeChainBasedOnDirective(lastLink, directives[whichDirective]);
        }
      }
      return lastLink;
    },

    // given a scope chain and a directive, extends the scope chain if necessary
    // does not operate on anchor directives
    _extendScopeChainBasedOnDirective: function(lastLink, directive){
      // todo: turn these into named methods rather than a switch statement
      switch(directive[0]){
        case 'within':
//todo: test that this isn't broken - it used to not do a lookup, only checked the last scope
//todo: deprecate the suppressObservers flag
          return this._extendScopeChain(lastLink, this._lookupInScopeChain(directive[1], lastLink, {suppressObservers: true}), {type:'within', key: directive[1]});
        break;
//todo: finish refactoring from here. asdf;
        case 'withinItem':
// todo: write a test this for inadvertent fallthrough, as if it still said this._lookupInScopeChain(directive[1], lastLink, {suppressObservers: true})
          return this._extendScopeChain(lastLink, this.scopeChain.scope[directive[1]], {type:'withinItem', key: directive[1]}); //todo: changed from type:'within' - will that break anything?
        break;
        case 'bindItem':
          var itemBindings = {};
          if(directive.length === 4){
            itemBindings[directive[2]] = directive[1];
          }
          itemBindings[js.last(directive)] = new this._Fallthrough(directive[1]);
          return this._extendScopeChain(lastLink, itemBindings, {type:'itemBindings', key:directive[1]});
        break;
        default:
          return lastLink;
        break;
      }
    },

    _buildScopeChainFromAnchorNames: function(names, lastLink){
      if(names){
        for(var whichToken = 1; whichToken < names.length; whichToken++){
          var scopeKey = names[whichToken];
          js.errorIf(!this.scopes[scopeKey], 'could not follow anchored directive, nothing found at react.scopes.'+scopeKey);
          lastLink = this._extendScopeChain(lastLink, this.scopes[scopeKey], {type:'anchor', key: scopeKey});
        }
      }
      return lastLink;
    },

    _buildScopeChain: function(scopes, options){
      options = options || {};
      var lastLink = options.prefix;
      if(scopes){
        for(var which = 0; which < scopes.length; which++){
          lastLink = this._extendScopeChain(lastLink, scopes[which], options);
        }
      }
      return lastLink;
    },

    _extendScopeChain: function(link, additionalScope, options){
      options = options || {};
      return {
        parent: link,
        scope: additionalScope,
        type: options.type,
        key: options.key,
        anchorKey: options.type === 'anchor' ? options.key : (link||{}).anchorKey
      };
    },

    update: function(){
      return this._updateTree.apply(this, arguments);
    },

    // todo: add update(object, key) signature, for refreshing only from certain properties
    _updateTree: function(options){
      options = options || {};
      if(options.nodeType){
        // detect argument signature of (node, scope)
        options = {
          node: arguments[0],
          scope: arguments[1]
        };
      }

      var root = options.node;

      //todo: test these
      //js.errorIf(!root, 'no root supplied to update()');
      //js.errorIf(this.isNode(root), 'first argument supplied to react.update() must be a dom node');
      js.errorIf(options.scope && options.scopes, 'you must supply only one set of scopes');

      var nodes = Array.prototype.slice.apply(root.querySelectorAll('[react]'));
      var updateContext = js.create(this.commands, {
        enqueueNodes: function(newNodes){
          nodes = nodes.concat(newNodes);
          for(var whichNode = 0; whichNode < newNodes.length; whichNode++){
            delete updateContext.bequeathedScopeChains[this.getNodeKey(newNodes[whichNode])];
            delete updateContext.loopItemTemplates[this.getNodeKey(newNodes[whichNode])];
          }
        },
        bequeathedScopeChains: {},
        loopItemTemplates: {}
      });
      var scopes = options.scope ? [options.scope] : options.scopes ? options.scopes : undefined;
      if(options.anchor){
        this.anchor({node: root, scopes:scopes});
        scopes = undefined;
      }
      var baseScopeChain = this._buildScopeChain(scopes, {type: 'updateInputs', prefix: this._buildScopeChainForNode(root, options.fromDirective || 0)});
      updateContext.bequeathedScopeChains[this.getNodeKey(root)] = this._updateNodeGivenScopeChain(root, baseScopeChain, updateContext, options.fromDirective);

      for(var i = 0; i < nodes.length; i++){
        this._updateNode(nodes[i], updateContext);
      }

      return root;
    },

    _getParent: function(node, updateContext){
      var ancestor = $(node).parent()[0];
      var repeatLimit = 1000;
      while(repeatLimit--){
        if(!ancestor || ancestor === document){
          return false;
        } else if (
          ancestor.getAttribute('react') ||
          updateContext.bequeathedScopeChains[this.getNodeKey(ancestor)] || // todo: what's this cover?
          updateContext.loopItemTemplates[this.getNodeKey(ancestor)] // todo: I don't think we need this now that it gets a special class attached to it
        ){
          return ancestor;
        }
        ancestor = $(ancestor).parent()[0];
      }
      js.error('_getParent() broke');
    },

    _updateNode: function(node, updateContext){
      //todo: test that you never revisit a node
      var nodeKey = this.getNodeKey(node);
      if(typeof updateContext.bequeathedScopeChains[nodeKey] !== 'undefined'){
        // node has already been visited
        return;
      }

      if(updateContext.loopItemTemplates[this.getNodeKey(node)]){ // todo: get rid of all these references to 'loop item templates', use custom class instead
        updateContext.bequeathedScopeChains[nodeKey] = false;
        return;
      }
      var previousParent = 'unmatchable';
      var parent = this._getParent(node, updateContext);
      // if processing the parent leads to this node having a new parent, repeat
      while(parent !== previousParent){
        if(!parent){
          updateContext.bequeathedScopeChains[nodeKey] = false;
          return;
        }
        this._updateNode(parent, updateContext);
        if(updateContext.bequeathedScopeChains[this.getNodeKey(parent)] === false){
          updateContext.bequeathedScopeChains[nodeKey] = false;
          return;
        }
        previousParent = parent;
        parent = this._getParent(node, updateContext);
      }

      var scopeChain = updateContext.bequeathedScopeChains[this.getNodeKey(parent)];
      updateContext.bequeathedScopeChains[nodeKey] = this._updateNodeGivenScopeChain(node, scopeChain, updateContext);
    },

    _updateNodeGivenScopeChain: function(node, scopeChain, updateContext, fromDirective){
      var nodeKey = this.getNodeKey(node);
      var directives = this._getDirectives(node);

      var pushScope = function(scope, options){
        scopeChain = this._extendScopeChain(scopeChain, scope, options);
      };

      for(var i = fromDirective || 0; i < directives.length; i++){
        this._followDirective(directives[i], js.create(updateContext, {
          node: node,
          directiveIndex: i,
          scopeChain: scopeChain,
          pushScope: pushScope
        }));
      }

      return scopeChain;
    },

    _getDirectives: function(node){
      var directiveStrings = (node.getAttribute('react')||'').split(this._matchers.directiveDelimiter);
      var that = this;
      var directives = js.map(directiveStrings, function(which, string){
        return js.trim(string).replace(that._matchers.negation, '!').split(that._matchers.space);
      });
      if(directives[0] && directives[0][0] === 'anchored'){
        var anchored = directives.shift();
      }
      directives = js.filter(directives, function(directive){
        return !!directive[0];
      });
      directives.anchored = anchored;
      return directives;
    },

    _setDirectives: function(node, directives){
      var anchored = directives.anchored;
      directives = js.filter(directives, function(directive){
        return !!directive[0];
      });
      directives.anchored = anchored;
      if(directives.anchored){
        directives.unshift(directives.anchored);
      }
      var directiveStrings = js.map(directives, function(which, directive){
        return directive.join(' ');
      });
      node.setAttribute('react', directiveStrings.join(', '));
    },

    _prependDirective: function(node, directive){
      var directives = this._getDirectives(node);
      directives.unshift(directive);
      this._setDirectives(node, directives);
    },

    _followDirective: function(directive, context){
      try{
        var command = directive.shift();
        js.errorIf(!this.commands[command], command+' is not a valid react command');
        this.commands[command].apply(context, directive);
      }catch (error){
        var directive = this._getDirectives(context.node)[context.directiveIndex];
        js.log('Failure during React update: ', {
          'original error': error,
          'while processing node': context.node,
          'index of failed directive': context.directiveIndex,
          'directive call': directive[0]+'('+directive.slice(1).join(', ')+')',
          'scope chain description': this._describeScopeChain(context.scopeChain),
          '(internal scope chain object) ': context.scopeChain
        });
        throw error;
      }
    },

    _describeScopeChain: function(link){
      var scopeChainDescription = [];
      do{
        scopeChainDescription.push(['scope: ', link.scope, ', ' + 'type of scope shift: ' + link.type + (link.key ? '(key: '+link.key+')': '') + (link.anchorKey ? ', anchored to: '+link.anchorKey+')': '')]);
      }while(link = link.parent);
      return scopeChainDescription;
    },

    anchor: function(options){
      options = options || {};
      if(options.nodeType){
        options = {
          node: arguments[0],
          scope: arguments[1]
        };
      }
      var node = options.node;
      var scopes = options.scope ? [options.scope] : options.scopes;

      var nodeKey = this.getNodeKey(node);
      this.nodes[nodeKey] = node;
      var directives = this._getDirectives(node);
      // todo: clean up after any existing anchor
      directives.anchored = ['anchored'];
      for(var i = 0; i < scopes.length; i++){
        var scopeKey = this.getScopeKey(scopes[i]);
        this.scopes[scopeKey] = scopes[i];
        directives.anchored.push(scopeKey);
      }
      this._setDirectives(node, directives);
      return options.node;
    },

    _observeScope: function(object, prefix, key, node, directiveIndex, anchorKey, didMatch){
      // todo: scope observers per node-object anchoring, for easy cleanup of memory references
      var nodeKey = this.getNodeKey(node);
      this.nodes[nodeKey] = node;
      var observations = node['directive ' + directiveIndex + ' observes'] = node['directive ' + directiveIndex + ' observes'] || [];
      observations.push({object: object, key: key, didMatch: didMatch});
      object.observers = object.observers || {};
      object.observers[key] = object.observers[key] || {};
      object.observers[key][nodeKey + ' ' + directiveIndex + ' ' + prefix] = true;
    },

    _disregardScope: function(node, directiveIndex){
      // todo: check this, it might be jank
      var nodeKey = this.getNodeKey(node);
      var observations = node['directive ' + directiveIndex + ' observes'];
      for(var whichObservation = 0; whichObservation <  observations.length; whichObservation++){
        var observation = observations[whichObservation];
        delete observation.object.observers[observation.key][nodeKey + ' ' + directiveIndex];
      }
      delete nodes.observing[directiveIndex];
      if(!js.size(nodes.observing)){
        delete this.nodes[nodeKey];
      }
    },

    _Fallthrough: function(key){
      this.key = key;
    },

    _lookupInScopeChain: function(key, scopeChain, options){
      if(!scopeChain){
        return;
      }
      options = options || {};
      var negate;
      var value;
      if(key[0] === '!'){
        negate = true;
        key = key.slice(1);
      }
      if (this._matchers.isString.test(key)) {
        return key.slice(1, key.length-1);
      }

      // todo: clean up any pre-existing observers

      var keys = key.split('.');
      var baseKey = keys.shift();
      // the search paths list holds a set of namespaces
      do {
        var object = scopeChain.scope;
        value = object[baseKey];
        if(scopeChain.anchorKey && options.listener && !options.suppressObservers){
          this._observeScope(object, '', baseKey, options.listener.node, options.listener.directiveIndex, scopeChain.anchorKey, value !== undefined);
        }
        if(value instanceof this._Fallthrough){
          baseKey = value.key;
        }else if(value !== undefined){
          break;
        }
      }while((scopeChain = scopeChain.parent));

      var prefix = baseKey + '.';
      // one for each segment of the dot acess
      while(keys.length){
        object = value;
        if(object === undefined || object === null){
          return options.returnObject ? false : js.error('can\'t find keys '+keys.join('.')+' on an undefined object');
        }
        if(scopeChain.anchorKey && !options.returnObject && !options.suppressObservers){
          this._observeScope(object, prefix, keys[0], options.listener.node, options.listener.directiveIndex, scopeChain.anchorKey, true);
        }
        prefix = prefix + keys[0] + '.';
        value = object[keys.shift()];
      }

      if(options.returnObject){
        return object;
      }

      if(typeof value === 'function'){ value = value.call(object); }
      return negate ? ! value : value;
    }

  };

  react.integrate = {
    jQuery: function(){
      jQuery.fn.update = function(scope){
        react.update(this, scope);
      };
    }
  };


  react.commands = js.create(react, {

  /*
   * when a command runs, it will have a 'this' scope like the following (arrows indicate prototype relationships
   *
   * react {
   * }
   *
   *  ^
   *  |
   * commands {
   *   command handler definitions
   *   lookup(key)
   * }
   *
   *  ^
   *  |
   * // a new processing scope is created for each node to be updated
   * nodeContext {
   *   node
   *   scopeChain
   * }
   */

    lookup: function(key, options){
      options = options || {};
      options.listener = {
        node: this.node,
        directiveIndex: this.directiveIndex
      };
      return this._lookupInScopeChain(key, this.scopeChain, options);
    },

    anchored: function(token){
      this.pushScope(this.scopes[token], {type:'anchor', key:token});
    },

    within: function(key){
      // todo: port and test this
      // js.errorIf(typeof scope !== 'object' && typeof scope !== 'array' && typeof scope !== 'function', 'mask commands must receive a namespacing value');
      this.pushScope(this.lookup(key), {type:'within', key:key});
    },

    contain: function(key){
      // using innerHTML to clear the node because the jQuery convenience functions unbind event handlers. This would be an unexpected side effect for most React user consumption cases.
      this.node.innerHTML = '';
      var insertion = this.lookup(key);
      // if the insertion is a node, use the dom appending method, but insert other items as text
      jQuery(this.node)[insertion && insertion.nodeType ? 'append' : 'text'](insertion);
    },

    classIf: function(conditionKey, nameKey){
      this.node.classIfs = this.node.classIfs || {};
      var condition = this.lookup(conditionKey);
      var className;
      var persistence = conditionKey + ' ' + nameKey;
      if(condition){
        className = this.lookup(nameKey);
        if(className){
          $(this.node).addClass(className);
          this.node.classIfs[persistence] = className;
        }
      } else {
        className = this.node.classIfs[persistence] || this.lookup(nameKey);
        if(className){
          $(this.node).removeClass(className);
          delete this.node.classIfs[persistence];
        }
      }
    },

    _createItemNodes: function(makeDirective){
      var $loopChildren = jQuery(this.node).children();
      js.errorIf($loopChildren.length < 2, 'looping nodes must contain at least 2 children - one item template and one results container');
      var $itemTemplate = $loopChildren.first();
      //js.errorIf(this._getDirectives($itemTemplate[0])[0].join(' ') !== 'itemTemplate', 'the item template must declare itself with an item directive');
      $itemTemplate.addClass('reactItemTemplate');
      this.loopItemTemplates[this.getNodeKey($itemTemplate[0])] = $itemTemplate[0];
      var $resultsContainer = $($loopChildren[1]);
      var $resultsContents = $resultsContainer.children();

      // todo: ignore binding scopes when looking for scope to iterate over
      var collection = this.scopeChain.scope;
      // todo: don't allow looping over static native objects (like strings - this is almost certainly an error)
      js.errorIf(collection === null || collection === undefined, 'The loop command expected a collection, but instead encountered '+collection);

      var itemNodes = [];
      // todo: support hash collections
      for(var i = 0; i < collection.length; i++){
        var itemNode = $resultsContents[i];
        if(!itemNode){
          itemNode = $itemTemplate.clone().removeClass('reactItemTemplate')[0];
          // todo: implement bindings as key aliases
          js.errorIf(this._matchers.space.test(i), 'looping not currently supported over colletions with space-filled keys'); // todo: make this even more restrictive - just alphanumerics
          var itemDirective = makeDirective(i);
          this._prependDirective(itemNode, itemDirective);
          this.enqueueNodes([itemNode].concat(Array.prototype.slice.apply(itemNode.querySelectorAll('[react]'))));
        }
        itemNodes.push(itemNode);
      }
      if(collection.length !== $resultsContents.length){
        $resultsContainer.html(itemNodes);
      }
    },

    withinEach: function(){
      // todo: return here (and everywhere else) if collection is undefined.  test for this
      this._createItemNodes(function(index){
        return ['withinItem', index];
      });
    },

    withinItem: function(key){
      // todo: add a rule to only allow getting items from last scope (check if key < scope.length?)
      // todo: add a rule to make sure the last scope object is an array
      js.errorIf(this.scopeChain.scope.length-1 < +key, 'Tried to re-render a node for an index the no longer exists');
      // todo: want to raise an error including link to this.scopeChain.scope - write an error helper
      js.errorIf(!this.scopeChain.scope[key], 'Could not find anything at key '+key+' on the scope object');
      // todo: might be a problem that using the within() as a helper will give the scope a type of 'within'
      this.within(key);
    },

    'for': function(keyAlias, valueAlias){
      var aliases = arguments;
      // todo: return here (and everywhere else) if collection is undefined.  test for this
      this._createItemNodes(function(index){
        return ['bindItem', index].concat(Array.prototype.slice.call(aliases));
      });
    },

    bindItem: function(key, keyAlias, valueAlias){
      if(valueAlias === undefined){
        valueAlias = keyAlias;
        keyAlias = undefined;
      }

      // set up an item scope to be applied for each item
      // a new scope will be created with bindings for valueAlias and optionally for keyAlias
      var itemBindings = {};
      if(keyAlias !== undefined){
        itemBindings[keyAlias] = key;
      }
      // todo: don't make this a fallthrough - create an explicit binding to the previous array scope object
      itemBindings[valueAlias] = new this._Fallthrough(key);

      this.pushScope(itemBindings, {type:'bindItem', key:key});
    },

    showIf: function(condition){
      jQuery(this.node)[this.lookup(condition) ? 'show' : 'hide']();
    },

    visIf: function(condition){
      jQuery(this.node).css('visibility', this.lookup(condition) ? 'visible' : 'hidden');
    },

    attr: function(name, value){
      js.errorIf(arguments.length !== 2, 'the attr directive requires 2 arguments');

      name = this.lookup(name);
      value = this.lookup(value);

      if(!js.among(['string', 'number'], typeof name)){
        js.log('bad attr name: ', name);
        js.error('expected attr name token ' + name + ' to resolve to a string or number, not ' + typeof name);
      }else if(!js.among(['string', 'number'], typeof value)){
        js.log('bad attr value: ', value);
        js.error('expected attr value token ' + value + ' to resolve to a string or number not, not ' + typeof value);
      }

      jQuery(this.node).attr(name, value);
    },

    attrIf: function(condition, name, value){
      if(this.lookup(condition)){
        $(this.node).attr(this.lookup(name), this.lookup(value));
      } else {
        $(this.node).removeAttr(this.lookup(name));
      }
    },

    checkedIf: function(condition){
      $(this.node).attr('checked', this.lookup(condition));
    }

  });

}());
