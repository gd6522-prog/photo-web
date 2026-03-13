//version : 1010 -> first release
/*verson : 1020 
crossdomain 및 xdr 이벤트 전송 실패 문제 수정 : xhr jsonp 사용 
WebSocket실패시 http모드로 
version : 1023

*****2019-06-05  *****
1. jquery 사용하지 않고, http 모드 crossdomain 문제 해결
2. viewer 여러개 띄울때 함수  및 이벤트 각각 동작할 수 있도록 추가.
**********************
*/
var _isHttpMode = false;
var _isWaitInstall = false;
var _port = 36480;
var _sslport = 36510;
if (typeof JSON !== 'object') {
	JSON = {};
}
(function() {
	'use strict';
	var f = function(n) {
		return n < 10 ? '0' + n : n;
	};
	if (typeof Date.prototype.toJSON !== 'function') {
		Date.prototype.toJSON = function(key) {
			return isFinite(this.valueOf()) ? this.getUTCFullYear() + '-' + f(this.getUTCMonth() + 1) + '-' + f(this.getUTCDate()) + 'T' + f(this.getUTCHours()) + ':' + f(this.getUTCMinutes()) + ':'
					+ f(this.getUTCSeconds()) + 'Z' : null;
		};
		String.prototype.toJSON = Number.prototype.toJSON = Boolean.prototype.toJSON = function(key) {
			return this.valueOf();
		};
	}
	var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g, escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g, gap, indent, meta = { // table of character substitutions
		'\b' : '\\b',
		'\t' : '\\t',
		'\n' : '\\n',
		'\f' : '\\f',
		'\r' : '\\r',
		'"' : '\\"',
		'\\' : '\\\\'
	}, rep;
	var quote = function(string) {
		escapable.lastIndex = 0;
		return escapable.test(string) ? '"' + string.replace(escapable, function(a) {
			var c = meta[a];
			return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
		}) + '"' : '"' + string + '"';
	};
	var str = function(key, holder) {
		var i, k, v, length, mind = gap, partial, value = holder[key];
		if (value && typeof value === 'object' && typeof value.toJSON === 'function') {
			value = value.toJSON(key);
		}
		if (typeof rep === 'function') {
			value = rep.call(holder, key, value);
		}
		switch (typeof value) {
		case 'string':
			return quote(value);
		case 'number':
			return isFinite(value) ? String(value) : 'null';
		case 'boolean':
		case 'null':
			return String(value);
		case 'object':
			if (!value) {
				return 'null';
			}
			gap += indent;
			partial = [];
			if (Object.prototype.toString.apply(value) === '[object Array]') {
				length = value.length;
				for (i = 0; i < length; i += 1) {
					partial[i] = str(i, value) || 'null';
				}
				v = partial.length === 0 ? '[]' : gap ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' : '[' + partial.join(',') + ']';
				gap = mind;
				return v;
			}
			if (rep && typeof rep === 'object') {
				length = rep.length;
				for (i = 0; i < length; i += 1) {
					if (typeof rep[i] === 'string') {
						k = rep[i];
						v = str(k, value);
						if (v) {
							partial.push(quote(k) + (gap ? ': ' : ':') + v);
						}
					}
				}
			} else {
				for (k in value) {
					if (Object.prototype.hasOwnProperty.call(value, k)) {
						v = str(k, value);
						if (v) {
							partial.push(quote(k) + (gap ? ': ' : ':') + v);
						}
					}
				}
			}
			v = partial.length === 0 ? '{}' : gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' : '{' + partial.join(',') + '}';
			gap = mind;
			return v;
		}
	};
	if (typeof JSON.stringify !== 'function') {
		JSON.stringify = function(value, replacer, space) {
			var i;
			gap = '';
			indent = '';
			if (typeof space === 'number') {
				for (i = 0; i < space; i += 1) {
					indent += ' ';
				}
			} else if (typeof space === 'string') {
				indent = space;
			}
			rep = replacer;
			if (replacer && typeof replacer !== 'function' && (typeof replacer !== 'object' || typeof replacer.length !== 'number')) {
				throw new Error('JSON.stringify');
			}
			return str('', {
				'' : value
			});
		};
	}
	if (typeof JSON.parse !== 'function') {
		JSON.parse = function(text, reviver) {
			var j;

			function walk(holder, key) {
				var k, v, value = holder[key];
				if (value && typeof value === 'object') {
					for (k in value) {
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							v = walk(value, k);
							if (v !== undefined) {
								value[k] = v;
							} else {
								delete value[k];
							}
						}
					}
				}
				return reviver.call(holder, key, value);
			}
			text = text + "";
			cx.lastIndex = 0;
			if (cx.test(text)) {
				text = text.replace(cx, function(a) {
					return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
				});
			}
			if (/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(
					/(?:^|:|,)(?:\s*\[)+/g, ''))) {
				j = (new Function('return ' + text))();
				return typeof reviver === 'function' ? walk({
					'' : j
				}, '') : j;
			}
			throw new Error('JSON.parse');
		};
	}
}());
start_OZUtil = (function() {
var OZUtil = {
	
	EXEVeiwerEventsForViewerID : {},
	EXEVeiwerEvents : {},
	EXEViewerFuncCB : null,
	OZViewerMap : {},
	OZOZViewerIDs : [],	
	EXEViewerHandle : null,
	EXEEventKey : null,
	OZViewerParameterNames : [],
	OZViewerParameters : {},
	OZViewerOptions : {},
	EXEVeiwerCallFunctionsForViewerID : {},
	OZNScreenAdMap : {},
	OZNScreenAd_IDs : [],
	
	guid : function() {
		function s4() {
			return ((1 + Math.random()) * 0x10000 | 0).toString(16).substring(1);
		}
		return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
	},
	
	createXDRHttpRequest : function() {
		
		var xdr = null;
		
		if (window.XDomainRequest) {
			xdr = new XDomainRequest();
			bXHR = false;
		}
		
		return xdr;
	},
	
	getRequestURL : function(){
		
		var cur_protocolName = window.location.protocol;
		var url = "";
		if (cur_protocolName === 'https:') {
			url = "https://127.0.0.1:" + _sslport +"/ozrvservice";
		} else {
			url = "http://127.0.0.1:" + _port +"/ozrvservice";

		}
		
		return url;
		
	},
	GetConnection : function() {
		
		var CONNECTION = null;
		var cur_protocolName = window.location.protocol;
		var url;
		if (cur_protocolName == 'https:') {
			url = 'wss://127.0.0.1:' + _sslport +'/ozrvservice';
		} else {
			url = 'ws://127.0.0.1:' + _port +'/ozrvservice';
		}
		try {
			CONNECTION = new WebSocket(url);
		} catch (e) {
			console.log("Error :: fail to create socket");
			_isHttpMode = true;
			console.log(e);
		}

		return CONNECTION;
	},

	splitparam : function(_param) {
		var _params = new Array();
		var startindex = 0;
		var length = 1024;
		while (true) {
			var token = _param.substr(startindex, length);
			if (token == "") {
				break;
			}
			_params.push(token);
			startindex += length;
		}

		return _params;
	},

	GetIEVersion : function() {
		
		var rv = -1;
		if (navigator.appName === "Microsoft Internet Explorer") {
			var ua = navigator.userAgent;
			var re = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
			if (re.exec(ua) != null)
				rv = parseFloat(RegExp.$1);
			
		} else if (navigator.appName === "Netscape") {
			var ua = navigator.userAgent;
			var re = new RegExp("Trident/.*rv:([0-9]{1,}[\.0-9]{0,})");
			if (re.exec(ua) != null) {
				rv = parseFloat(RegExp.$1);
			}
		}
		

		return rv;
	},
	
	
	addEventListener: function (cmdtype, callback,ozid)
	{
		
		if(arguments.length == 2)
		{
			ozid = "dummy";;
			
		}
		
		var EXEVeiwerEvents = OZUtil.EXEVeiwerEventsForViewerID[ozid];
		if(EXEVeiwerEvents == undefined)
		{
			EXEVeiwerEvents = {};
		}
		EXEVeiwerEvents[cmdtype] = callback;
		OZUtil.EXEVeiwerEventsForViewerID[ozid] = EXEVeiwerEvents;	
	},
	
	removeViewerID : function(OZViewerID)
	{
		var OZMap = OZUtil.OZViewerMap[OZViewerID];
		
		if(OZMap)
		{
			var CONNECTION = OZMap[0];
			if(CONNECTION != null)
			{
				// close WebSocket
				CONNECTION.close();
			}
			
			// Clean up ViewerIDs
			var idx = OZUtil.OZOZViewerIDs.indexOf(OZViewerID);
			if(idx > -1)
			{
				OZUtil.OZOZViewerIDs.splice(idx, 1);
			}
			
			// Clean Up Viewer map 
			delete OZUtil.OZViewerMap[OZViewerID];
			// Clean Up CallFunction list 
			delete OZUtil.EXEVeiwerCallFunctionsForViewerID[OZViewerID];
		}
	},
		
	
	EventCallBack_WS : function( eventInfo,OZViewerID)
	{
		var viewerID = OZViewerID;
		OZUtil.EXEVeiwerEvents = OZUtil.EXEVeiwerEventsForViewerID[OZViewerID];
		if(OZUtil.EXEVeiwerEvents == undefined)
		{
			OZUtil.EXEVeiwerEvents = OZUtil.EXEVeiwerEventsForViewerID["dummy"];
			viewerID = "dummy";
		}
		
		if(OZUtil.EXEVeiwerEvents == undefined)
			return;
		
		if(eventInfo.command_type == "OZExitCommand")
		{
			OZUtil.removeViewerID(viewerID);
		}
		
		if(OZUtil.EXEVeiwerEvents[eventInfo.command_type] == undefined)
		{
			//OZUtil.CloseEXEViewer(OZViewerID);
			//OZUtil.removeViewerID(viewerID);
			return;	
		}
		
		OZUtil.EventCallBack(eventInfo);
		
	},
	EventCallBack_Http : function( eventInfo,OZViewerID)
	{
		var viewerID = OZViewerID;
		OZUtil.EXEVeiwerEvents = OZUtil.EXEVeiwerEventsForViewerID[OZViewerID];
		if(OZUtil.EXEVeiwerEvents == undefined)
		{
			OZUtil.EXEVeiwerEvents = OZUtil.EXEVeiwerEventsForViewerID["dummy"];
			viewerID = "dummy";
		}
		
		if(OZUtil.EXEVeiwerEvents == undefined)
			return;
		
		if(eventInfo.command_type == "OZExitCommand")
		{
			OZUtil.removeViewerID(viewerID);
		}
		
		if(OZUtil.EXEVeiwerEvents[eventInfo.command_type] == undefined)
		{
			return;	
		}
		
		OZUtil.EventCallBack(eventInfo);
		
	},
	EventCallBack : function( eventInfo)
	{
		

		if(OZUtil.EXEVeiwerEvents == undefined)
		{
			return;
		}
		
		
		//if(OZUtil.EXEVeiwerEvents[eventInfo.command_type] == undefined)
			//return;
		var eventFunc="";
		if(eventInfo.command_type == "OZExitCommand")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null);
		}
		else if(eventInfo.command_type == "OZBankBookPrintCommand" || eventInfo.command_type == "OZPageChangeCommand" || eventInfo.command_type == "OZReportChangeCommand" || eventInfo.command_type == "OZExportMemoryStreamCallBack")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1);
		}
		else if(eventInfo.command_type == "OZPageBindCommand" || eventInfo.command_type == "OZPostCommand" || eventInfo.command_type == "OZCommand" || eventInfo.command_type == "OZMailCommand" || eventInfo.command_type == "OZUserActionCommand")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2);
		}
		else if(eventInfo.command_type == "OZProgressCommand" )
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2,eventInfo.command_param3);
			//var eventFunc = namespace + "_" + eventInfo.command_type + "('" + eventInfo.command_param1 + "','" + eventInfo.command_param2 + "','" + eventInfo.command_param3 + "')";
		}
		else if(eventInfo.command_type == "UserEvent")
		{
			if(Object.keys(eventInfo).length < 5)
			{	
				OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2,eventInfo.command_param3);
			}
			else
			{
				OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2,eventInfo.command_param3,eventInfo.command_param4);
			}
		}
		else if(eventInfo.command_type == "OZErrorCommand" || eventInfo.command_type == "OZEFormInputEventCommand")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2,eventInfo.command_param3,eventInfo.command_param4);
		}
		else if(eventInfo.command_type == "OZExportCommand" || eventInfo.command_type == "OZLinkCommand")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2,eventInfo.command_param3,eventInfo.command_param4,eventInfo.command_param5);
			
		}
		else if(eventInfo.command_type == "OZPrintCommand")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1,eventInfo.command_param2,eventInfo.command_param3,eventInfo.command_param4,eventInfo.command_param5,eventInfo.command_param6,eventInfo.command_param7,eventInfo.command_param8,eventInfo.command_param9,eventInfo.command_param10);
			//var eventFunc = namespace + "_" + eventInfo.command_type + "('" + eventInfo.command_param1 + "','" + eventInfo.command_param2 + "','" + eventInfo.command_param3 + "','" + eventInfo.command_param4 + "','" + eventInfo.command_param5 + "','" + eventInfo.command_param6 + "','" + eventInfo.command_param7 + "','" + eventInfo.command_param8 + "','" + eventInfo.command_param9 + "','" + eventInfo.command_param10 + "')";
		}
		else if(eventInfo.command_type == "OZCustomButtonClickCommand")
		{
			OZUtil.EXEVeiwerEvents[eventInfo.command_type].call(null,eventInfo.command_param1);
		}
	},
	
	
	installViewer_WS : function(launcherversion, ztParam, InstallOZWebLauncher, StartOZViewer) {

		var CONNECTION = OZUtil.GetConnection();
		if(_isHttpMode)
		{
			OZUtil.installViewer_HTTP(launcherversion, ztParam, InstallOZWebLauncher, StartOZViewer);
			return;
		}
		CONNECTION.onopen = function() {
			var installParam = new Object();
			installParam.version = launcherversion;
			
			CONNECTION.send("CHK:" + JSON.stringify(installParam));
		};

		var _isClose = false;
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			if(!_isClose)
			{
				InstallOZWebLauncher();
			}
		};

		// Log messages from the server
		CONNECTION.onmessage = function(e) {
			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {
				var result = e.data.substring(4, e.data.length);
				
				var jsonInfo = {};
				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
					
					jsonInfo = JSON.parse(result(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				

				if (jsonInfo.version < launcherversion) {
					_isClose = true;
					CONNECTION.close();
					InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					_isClose = true;
					CONNECTION.close();
					OZUtil.StartUpdate_WS( ztParam, StartOZViewer);
				} else {
					console.log(jsonInfo.result);
					_isClose = true;
					CONNECTION.close();
					InstallOZWebLauncher();
				}
			}
		};
	},
	
	installViewer_HTTP : function(launcherversion,  ztParam, InstallOZWebLauncher, StartOZViewer) {

		var installParam = new Object();
		installParam.type = "chk";
		installParam.version = launcherversion;
		installParam.guid = OZUtil.guid();
		
		var url  = OZUtil.getRequestURL();
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(JSON.stringify(installParam)), true);

			 xdr.onerror = function() {
				InstallOZWebLauncher();
			};
			xdr.ontimeout = function () { 
				InstallOZWebLauncher();
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				if (jsonInfo.version < launcherversion) {
					InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					OZUtil.StartUpdate_HTTP( ztParam, StartOZViewer);
				} else {
					InstallOZWebLauncher();
				}
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
				
			window[callbackMethod] = (function (Args_launcherversion, Args_ztParam, Args_InstallOZWebLauncher, Args_StartOZViewer, jsonInfo) {
				if (jsonInfo.version < Args_launcherversion) {
						Args_InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					OZUtil.StartUpdate_HTTP( Args_ztParam, Args_StartOZViewer);
				} else {
					Args_InstallOZWebLauncher();
				}
			}).bind(null, launcherversion,  ztParam, InstallOZWebLauncher, StartOZViewer);
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				InstallOZWebLauncher();
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			script.src = url + encodeURIComponent(JSON.stringify(installParam)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
		

		
	},
	installViewer_core : function(fncParam,InstallOZWebLauncher){
		
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.installViewer_WS(fncParam.launcherversion, fncParam.ztParam, InstallOZWebLauncher, fncParam.StartOZViewer);
		} else {
			OZUtil.installViewer_HTTP(fncParam.launcherversion, fncParam.ztParam, InstallOZWebLauncher, fncParam.StartOZViewer);
		}
	},
	installViewer : function(launcherversion, ztParam, InstallOZWebLauncher, StartOZViewer) {
		
		var fncParam = new Object();
		fncParam.launcherversion = launcherversion;
		fncParam.ztParam = ztParam;
		fncParam.StartOZViewer = StartOZViewer;
		OZUtil.StartInstallViewer_core(fncParam,OZUtil.installViewer_core, InstallOZWebLauncher);
		

	},
	
	runOZViewer_WS : function(launcherversion, InstallOZWebLauncher, StartOZViewer) {

		var CONNECTION = OZUtil.GetConnection();
		if(_isHttpMode)
		{
			OZUtil.runOZViewer_HTTP(launcherversion, InstallOZWebLauncher, StartOZViewer);
			return;
		}
		CONNECTION.onopen = function() {
			var installParam = new Object();
			installParam.version = launcherversion;
			
			CONNECTION.send("CHK:" + JSON.stringify(installParam));
		};

		var _isClose = false;
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			if(!_isClose)
			{
				InstallOZWebLauncher();
			}
		};

		// Log messages from the server
		CONNECTION.onmessage = function(e) {
			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {
				var result = e.data.substring(4, e.data.length);
				
				var jsonInfo = {};
				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
					
					jsonInfo = JSON.parse(result(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				

				if (jsonInfo.version < launcherversion) {
					_isClose = true;
					CONNECTION.close();
					InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					_isClose = true;
					CONNECTION.close();
					StartOZViewer();
				} else {
					console.log(jsonInfo.result);
					_isClose = true;
					CONNECTION.close();
					InstallOZWebLauncher();
				}
			}
		};
	},
	
	runOZViewer_HTTP : function(launcherversion, InstallOZWebLauncher, StartOZViewer) {

		var installParam = new Object();
		installParam.type = "chk";
		installParam.version = launcherversion;
		installParam.guid = OZUtil.guid();
		
		var url  = OZUtil.getRequestURL();
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(JSON.stringify(installParam)), true);

			 xdr.onerror = function() {
				InstallOZWebLauncher();
			};
			xdr.ontimeout = function () { 
				InstallOZWebLauncher();
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				if (jsonInfo.version < launcherversion) {
					InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					StartOZViewer();
				} else {
					InstallOZWebLauncher();
				}
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
				
			window[callbackMethod] = (function (Args_launcherversion, Args_InstallOZWebLauncher, Args_StartOZViewer, jsonInfo) {
				if (jsonInfo.version < Args_launcherversion) {
						Args_InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					Args_StartOZViewer();
				} else {
					Args_InstallOZWebLauncher();
				}
			}).bind(null, launcherversion, InstallOZWebLauncher, StartOZViewer);
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				InstallOZWebLauncher();
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			script.src = url + encodeURIComponent(JSON.stringify(installParam)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
	},
	
	runOZViewer : function(launcherversion, InstallOZWebLauncher, StartOZViewer) {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.runOZViewer_WS(launcherversion, InstallOZWebLauncher, StartOZViewer);
		} else {
			OZUtil.runOZViewer_HTTP(launcherversion, InstallOZWebLauncher, StartOZViewer);
		}

	},
	StartUpdate_WS : function(ztParam, StartOZViewer) {
		
		var CONNECTION = OZUtil.GetConnection();

		if(_isHttpMode){
			OZUtil.StartUpdate_HTTP(ztParam, StartOZViewer);
			return;
		}
		
		CONNECTION.onopen = function() {
			

			CONNECTION.send("UPT:" + JSON.stringify(ztParam));
		};
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			CONNECTION.close();	
			
		};
		// Log messages from the server
		CONNECTION.onmessage = function(e) {

			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {
				var result = e.data.substring(4, e.data.length);
				var jsonInfo = {};
				
				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
					
					jsonInfo = JSON.parse(result.responseText(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}

				if (jsonInfo.result == "UPTOK") {
					CONNECTION.close();
					StartOZViewer("","");
				} else {
					console.log(jsonInfo.reason);
					CONNECTION.close();
					StartOZViewer("",jsonInfo.reason);
					
				}
			}
		};
	},
	StartUpdate_HTTP : function(ztParam, StartOZViewer) {
		
	
		ztParam.type = "upt";
		
		ztParam.guid = OZUtil.guid();

	
		var url  = OZUtil.getRequestURL();
		
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(JSON.stringify(ztParam)), true);

			 xdr.onerror = function() {
				console.log("fail to update(onerror)");
			};
			xdr.ontimeout = function () { 
				console.log("fail to update(ontimeout)");
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				if (jsonInfo.result == "UPTOK") {
					 StartOZViewer("","");
				 } else {
					 
					 console.log(jsonInfo.reason);
					 StartOZViewer("",jsonInfo.reason);
				 }
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
			
			window[callbackMethod] = (function (Args_ztParam, Args_StartOZViewer, jsonInfo) {
				if (jsonInfo.result == "UPTOK") {
					 Args_StartOZViewer("","");
				 } else {
					 console.log(jsonInfo.reason);
					 Args_StartOZViewer("",jsonInfo.reason);
				 }
			}).bind(null, ztParam, StartOZViewer);

				
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				console.log("fail to update");
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			
			script.src = url + encodeURIComponent(JSON.stringify(ztParam)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
		
	},
	
	
	StartUpdate : function(ztParam, StartOZViewer) {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.StartUpdate_WS(ztParam, StartOZViewer);
		} else {
			OZUtil.StartUpdate_HTTP(ztParam, StartOZViewer);
		}

	},
	setOption : function(options) {
		OZViewerOptions = options;
	},
	
	createViewer : function(OZViewerID,OZViewerLoaded) {
		
		if(arguments.length == 0)
		{
			OZViewerID = "dummy";
			
			OZViewerLoaded = null;
			
		}


		var params = "";
		/*for (var [key, value] of OZUtil.OZViewerParameters) {
		  params   +=  key + "=" + value + "!oz!";
		}*/
		
		var arr = OZUtil.OZViewerParameterNames;
		for(var i =0; i < arr.length; i ++)
		{
			params   +=  arr[i] + "=" + OZUtil.OZViewerParameters[arr[i]] + "!oz!";
			
		}
		
		
		OZUtil.StartOZViewer(OZViewerOptions, params, "!oz!", OZViewerID,OZViewerLoaded);
		OZViewerOptions = {};
		OZUtil.OZViewerParameters = {};
		OZUtil.OZViewerParameterNames = [];
	},
	
	setParameter : function(key,value) {
		if(OZUtil.OZViewerParameters[key] === undefined)
		{
			OZUtil.OZViewerParameterNames.push(key);
		}
		
		OZUtil.OZViewerParameters[key] = value;
	},
	OZEXEViewer_CheckEvent : function(ozid) {
		var OZMap = OZUtil.OZViewerMap[ozid];

		if (OZMap) {
			var evtPacket = new Object();
			evtPacket.type = "chkevt";
			evtPacket.ozeventkey =  OZMap[2];
			evtPacket.guid = OZUtil.guid();
			var url  = OZUtil.getRequestURL();
			
			if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
			{
				var xdr = OZUtil.createXDRHttpRequest();
				
				xdr.open("GET", url + encodeURIComponent(JSON.stringify(evtPacket)), true);
	
				 xdr.onerror = function() {
					console.log("fail to check event");
					setTimeout(function(){OZUtil.OZEXEViewer_CheckEvent(ozid)}, 500);
				};
				xdr.ontimeout = function () { 
					console.log("fail to check event");
					setTimeout(function(){OZUtil.OZEXEViewer_CheckEvent(ozid)}, 500);
				};
				
				xdr.onload = function () { 
					var jsonInfo = JSON.parse(xdr.responseText);
					if (jsonInfo.hasevent == "true") {
						var eventInfo = {};
						try {
							eventInfo = JSON.parse(jsonInfo.event);
						} catch (e) {
							
							eventInfo = JSON.parse(jsonInfo.event.replace(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
						}
						
						OZUtil.EventCallBack_Http( eventInfo,ozid);
						if(eventInfo.command_type != "OZExitCommand")
							OZUtil.OZEXEViewer_CheckEvent(ozid);
					}else if(jsonInfo.hasevent == "dummy") {
						OZUtil.EXEViewerHandle = null;
						OZUtil.EXEEventKey = null;
					}
					else if (jsonInfo.hasevent == "retry") {
						setTimeout(function(){OZUtil.OZEXEViewer_CheckEvent(ozid)}, 500);
					}
					else if (jsonInfo.hasevent == "finish") {
						// launcher callback value.
					}
				};
				setTimeout(function () {
					xdr.send();
				  }, 0);
			}
			else{
				var callbackMethod = 'callback_' + new Date().getTime();
				
				window[callbackMethod] = (function (Args_ozid, jsonInfo) {
					if (jsonInfo.hasevent == "true") {
						var eventInfo = {};
						try {
							eventInfo = JSON.parse(jsonInfo.event);
						} catch (e) {
							
							eventInfo = JSON.parse(jsonInfo.event.replace(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
						}
						
						OZUtil.EventCallBack_Http( eventInfo,Args_ozid);
						if(eventInfo.command_type != "OZExitCommand")
							OZUtil.OZEXEViewer_CheckEvent(Args_ozid);
					}else if(jsonInfo.hasevent == "dummy") {
						OZUtil.EXEViewerHandle = null;
						OZUtil.EXEEventKey = null;
					}
					else if (jsonInfo.hasevent == "retry") {
						setTimeout(function(){OZUtil.OZEXEViewer_CheckEvent(Args_ozid)}, 500);
					}
					else if (jsonInfo.hasevent == "finish") {
						// launcher callback value.
						
					}	
				}).bind(null, ozid);
	
				
				var callbackErrorMethod = callbackMethod + "_error";
				window[callbackErrorMethod] = function(e) {
					console.log("fail to check event");
					setTimeout(function(){OZUtil.OZEXEViewer_CheckEvent(ozid)}, 500);
				};
				
				var script = document.createElement('script');
				script.onerror = window[callbackErrorMethod];
				
				script.src = url + encodeURIComponent(JSON.stringify(evtPacket)) + '?callback='+callbackMethod;
				document.body.appendChild(script);
			}
		}
	},
	
	StartOZViewer_SendPacket : function(namespace, packet, _params, packetindex,OZViewerID,OZViewerLoaded) {
		
		var jsonstr = JSON.stringify(packet);
		var encodestr = encodeURIComponent(jsonstr);
		var uriDecode = decodeURIComponent(encodestr);
		var dummy = JSON.parse(uriDecode);
		
		var url  = OZUtil.getRequestURL();
		
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodestr, true);

			 xdr.onerror = function() {
				console.log("fail to send parameter");
			};
			xdr.ontimeout = function () { 
				console.log("fail to send parameter");
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				if (jsonInfo.isFinish == "true") {
					//OZUtil.EXEViewerHandle = jsonInfo.ozexeviewerhandle;
					//OZUtil.EXEEventKey = jsonInfo.ozeventkey;
					
					OZUtil.OZViewerMap[OZViewerID] = [null, jsonInfo.ozexeviewerhandle,jsonInfo.ozeventkey, false];
					OZUtil.OZOZViewerIDs.push(OZViewerID);

					if(OZViewerLoaded != null)
						OZViewerLoaded();
					OZUtil.OZEXEViewer_CheckEvent(OZViewerID);	// HTTP first caller timer.
				} else {

					packet.type = "pkt";
					packet.totalcount = _params.length - 1;
					packet.index = packetindex;
					packet.data = _params[packetindex++];
					packet.guid = OZUtil.guid();
					{
						OZUtil.StartOZViewer_SendPacket(namespace, packet, _params, packetindex,OZViewerID,OZViewerLoaded);
					}
				}
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
			
			window[callbackMethod] = (function (Args_namespace, Args_packet, Args_params, Args_packetindex, Args_OZViewerID, Args_OZViewerLoaded, jsonInfo) {
				if (jsonInfo.isFinish == "true") {
					//OZUtil.EXEViewerHandle = jsonInfo.ozexeviewerhandle;
					//OZUtil.EXEEventKey = jsonInfo.ozeventkey;
					
					OZUtil.OZViewerMap[Args_OZViewerID] = [null, jsonInfo.ozexeviewerhandle,jsonInfo.ozeventkey,false];
					OZUtil.OZOZViewerIDs.push(Args_OZViewerID);

					if(Args_OZViewerLoaded != null)
						Args_OZViewerLoaded();
					OZUtil.OZEXEViewer_CheckEvent(Args_OZViewerID);	// HTTP first caller timer.
				} else {

					packet.type = "pkt";
					packet.totalcount = Args_params.length - 1;
					packet.index = Args_packetindex;
					packet.data = Args_params[Args_packetindex++];
					packet.guid = OZUtil.guid();
					{
						OZUtil.StartOZViewer_SendPacket(Args_namespace, Args_packet, Args_params, Args_packetindex,Args_OZViewerID, Args_OZViewerLoaded);
					}
				}
			}).bind(null, namespace, packet, _params, packetindex, OZViewerID, OZViewerLoaded);

			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				console.log("fail to send parameter");
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			
			script.src = url + encodestr + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
		
		

	},
	StartOZViewer_HTTP : function(ozvieweroptions, param, sep,OZViewerID,OZViewerLoaded) {
		
		var namespace = ozvieweroptions["namespace"];
		var requireadmin = ozvieweroptions["requireadmin"];
		if(requireadmin == undefined)
			requireadmin = "false";

		var runObject = new Object();
		runObject.namespace = namespace;
		runObject.type = "run";
		runObject.param = param;
		runObject.sep = sep;
		runObject.requireadmin = requireadmin;

		var _param = JSON.stringify(runObject);

		var _params = OZUtil.splitparam(_param);
		var strHeader;

		var packet = new Object();
		var packetindex = 0;
		packet.type = "pkt";
		packet.totalcount = _params.length - 1;
		packet.index = packetindex;
		packet.data = _params[packetindex++];
		packet.guid = OZUtil.guid();

		OZUtil.StartOZViewer_SendPacket(namespace, packet, _params, packetindex,OZViewerID,OZViewerLoaded);

	},

	StartOZViewer_WS : function(ozvieweroptions, param, sep,OZViewerID,OZViewerLoaded) {
		var CONNECTION = OZUtil.GetConnection();
		
		if(_isHttpMode){
			OZUtil.StartOZViewer_HTTP(ozvieweroptions, param, sep,OZViewerID,OZViewerLoaded);
			return;
		}
		
		var namespace = ozvieweroptions["namespace"];
		var requireadmin = ozvieweroptions["requireadmin"];
		if(requireadmin == undefined)
			requireadmin = "false";
		
		CONNECTION.onopen = function() {
			var runObject = new Object();
			runObject.namespace = namespace;
			runObject.param = param;
			runObject.sep = sep;
			runObject.requireadmin = requireadmin;

			CONNECTION.send("RUN:" + JSON.stringify(runObject));
		};
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			console.log("error in EXEViewer run");
		};

		// Log messages from the server
		CONNECTION.onmessage = function(e) {
			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {

				var result = e.data.substring(4, e.data.length);
				var jsonInfo = {};

				var isloaded = false;
			
				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
					
					jsonInfo = JSON.parse(result.replace(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				

				if (jsonInfo.result == "OK") {
					
					if(OZViewerLoaded != null)
					{
						isloaded = true;
						OZUtil.OZViewerMap[OZViewerID] = [CONNECTION, jsonInfo.ozexeviewerhandle,jsonInfo.ozeventkey,false];
						OZUtil.OZOZViewerIDs.push(OZViewerID);
						OZViewerLoaded();
					}
				} else {
					console.log(jsonInfo.reason);
				}
				if(!isloaded)
				{
					OZUtil.OZViewerMap[OZViewerID] = [CONNECTION, jsonInfo.ozexeviewerhandle,jsonInfo.ozeventkey,false];
					OZUtil.OZOZViewerIDs.push(OZViewerID);
				}
			} else if (cmdtype == "EVT") {
				var result = e.data.substring(4, e.data.length);
				var eventInfo = {};
				

			
				try {
					eventInfo = JSON.parse(result);
				} catch (e) {
					
					eventInfo = JSON.parse(result.replace(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				
				OZUtil.EventCallBack_WS( eventInfo,OZViewerID);
			}else if (cmdtype == "FRT")
			{
				var result = e.data.substring(4, e.data.length);	
				if(OZUtil.EXEViewerFuncCB != null)
				{
					var resultInfo = {};
					try {
						resultInfo = JSON.parse(result);
					} catch (e) {
						
						resultInfo = JSON.parse(result.replace(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
					}
					OZUtil.EXEViewerFuncCB(resultInfo.retval);
				}
				
				// 다음 function 실행
				var OZMap = OZUtil.OZViewerMap[OZViewerID];
				if (OZMap) {	
					OZUtil.runCallFunction(OZViewerID);
				}
			}
		};

	},

	StartOZViewer : function(ozvieweroptions, param, sep,OZViewerID,OZViewerLoaded) {

		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.StartOZViewer_WS(ozvieweroptions, param, sep,OZViewerID,OZViewerLoaded);
		} else {
			OZUtil.StartOZViewer_HTTP(ozvieweroptions, param, sep,OZViewerID,OZViewerLoaded);
		}

	},

	CloseExeViewerSocket : function(connection) {
		if (connection != null) {
			connection.close();
		}
	},

	Cmd_SendPacket : function(packetstr) {

	var url  = OZUtil.getRequestURL();
	if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
	{
		var xdr = OZUtil.createXDRHttpRequest();
		
		xdr.open("GET", url + encodeURIComponent(packetstr), true);

		 xdr.onerror = function() {
			console.log("fail to send packet");
		};
		xdr.ontimeout = function () { 
			console.log("fail to send packet");
		};
		
		xdr.onload = function () { 
			var jsonInfo = JSON.parse(xdr.responseText);
			console.log(jsoninfo);
		};
		setTimeout(function () {
			xdr.send();
		  }, 0);
	}
	else{
		var callbackMethod = 'callback_' + new Date().getTime();
		window[callbackMethod] = function(jsonInfo){
			console.log(jsoninfo);
		}
		var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				console.log("fail to send packet");
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			
		script.src = url +  encodeURIComponent(packetstr) + '?callback='+callbackMethod;
		document.body.appendChild(script);
	}
	
	},
	CloseEXEViewer : function(key) {
		var OZMap = OZUtil.OZViewerMap[key];

		if (OZMap) {
			var packet = new Object();
			packet.type = "END";
			packet.ozexeviewerhandle = OZMap[1];
			
			var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
			
			if (verNumber > 10 || verNumber == -1) {
				
				var CONNECTION = OZMap[0];
				
				if(CONNECTION != null)
				{
					CONNECTION.send("END:" + JSON.stringify(packet));
				
					//CONNECTION.close();
				}
			} else {
				OZUtil.Cmd_SendPacket(JSON.stringify(packet));
			}
		}
	},
	
	OZCallFunction_WS : function(OZViewerID, eventParam) {
		var OZMap = OZUtil.OZViewerMap[OZViewerID];

		if (OZMap) {
			var CONNECTION = OZMap[0];
			CONNECTION.send("FNC:" + JSON.stringify(eventParam));
		}
	},
	
	OZEXEViewerRun_SendPacket_Fnc : function(packet, _params, packetindex, OZViewerID) {
		var url  = OZUtil.getRequestURL();
		
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(packetstr), true);

			 xdr.onerror = function() {
				console.log("fail to run function");
			};
			xdr.ontimeout = function () { 
				console.log("fail to run function");
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				if (jsonInfo.isFinish == "true") {
					if(OZUtil.EXEViewerFuncCB != null)
					{
						var fncrtInfo = {};
						
						try {
							fncrtInfo = JSON.parse(jsonInfo.fnc_ret);
						} catch (e) {
							
							fncrtInfo = JSON.parse(jsonInfo.fnc_ret.responseText(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
						}
						
						OZUtil.EXEViewerFuncCB(fncrtInfo.retval);
						
						// 다음 function 실행
						var OZMap = OZUtil.OZViewerMap[OZViewerID];
						if (OZMap) {	
							OZUtil.runCallFunction(OZViewerID);
						}
						
					}
				} else {

					packet.type = "pkt_fnc";
					packet.totalcount = _params.length - 1;
					packet.index = packetindex;
					packet.data = _params[packetindex++];
					packet.guid = OZUtil.guid();
					{
						OZUtil.OZEXEViewerRun_SendPacket_Fnc(packet, _params, packetindex, OZViewerID);

					}
				}
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
			
			window[callbackMethod] = (function (Args_packet, Args__params, Args_packetindex, Args_OZViewerID, jsonInfo) {
				if (jsonInfo.isFinish == "true") {
					if(OZUtil.EXEViewerFuncCB != null)
					{
						var fncrtInfo = {};
						
						try {
							fncrtInfo = JSON.parse(jsonInfo.fnc_ret);
						} catch (e) {
							
							fncrtInfo = JSON.parse(jsonInfo.fnc_ret.responseText(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
						}
						
						OZUtil.EXEViewerFuncCB(fncrtInfo.retval);
						
						// 다음 function 실행
						var OZMap = OZUtil.OZViewerMap[Args_OZViewerID];
						if (OZMap) {	
							OZUtil.runCallFunction(Args_OZViewerID);
						}
						
					}
				} else {

					Args_packet.type = "pkt_fnc";
					Args_packet.totalcount = Args__params.length - 1;
					Args_packet.index = Args_packetindex;
					Args_packet.data = Args__params[Args_packetindex++];
					Args_packet.guid = OZUtil.guid();
					{
						OZUtil.OZEXEViewerRun_SendPacket_Fnc(Args_packet, Args__params, Args_packetindex, Args_OZViewerID);

					}
				}
			}).bind(null, packet, _params, packetindex, OZViewerID);

			
				
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				console.log("fail to run function");
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			
			script.src = url +  encodeURIComponent(JSON.stringify(packet)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
		
		

	},
	GetInformation : function(OZViewerID,arg,callback){
		var eventParam = new Object();
		eventParam.arg1 = arg;
		
		OZUtil.OZCallFunction(OZViewerID,"GetInformation",JSON.stringify(eventParam),callback);
	},
	Script : function(OZViewerID,arg){
		var eventParam = new Object();
		eventParam.arg1 = arg;
		
		OZUtil.OZCallFunction(OZViewerID,"Script",JSON.stringify(eventParam), null);
	},
	CreateReport : function(OZViewerID,arg){
		var eventParam = new Object();
		eventParam.arg1 = arg;
		
		OZUtil.OZCallFunction(OZViewerID,"CreateReport",JSON.stringify(eventParam), null);
	},
	CreateReportEx : function(OZViewerID,param,sep){
		var eventParam = new Object();
		eventParam.arg1 = param;
		eventParam.arg2 = sep;
		
		OZUtil.OZCallFunction(OZViewerID,"CreateReportEx",JSON.stringify(eventParam), null);
	},
	ScriptEx : function(OZViewerID,cmd,param,sep,callback){
		var eventParam = new Object();
		eventParam.arg1 = cmd;
		eventParam.arg2 = param;
		eventParam.arg3 = sep;
		
		OZUtil.OZCallFunction(OZViewerID,"ScriptEx",JSON.stringify(eventParam),callback);
	},
	ReBind : function(OZViewerID,index, type, param, sep, keepEditing){
		var eventParam = new Object();
		eventParam.arg1 = index;
		eventParam.arg2 = type;
		eventParam.arg3 = param;
		eventParam.arg4 = sep;
		eventParam.arg5 = keepEditing;
		
		OZUtil.OZCallFunction(OZViewerID,"ReBind",JSON.stringify(eventParam), null);
	},
	Document_SetGlobal : function(OZViewerID,key,value,docIndex,callback){
		var eventParam = new Object();
		eventParam.arg1 = key;
		eventParam.arg2 = value;
		eventParam.arg3 = docIndex;
		
		OZUtil.OZCallFunction(OZViewerID,"Document_SetGlobal",JSON.stringify(eventParam),callback);
	},
	Document_SetChartStyle : function(OZViewerID,style,callback){
		var eventParam = new Object();
		eventParam.arg1 = style;
		
		OZUtil.OZCallFunction(OZViewerID,"Document_SetChartStyle",JSON.stringify(eventParam),callback);
	},
	Document_GetTitle : function(OZViewerID,callback){
		var eventParam = new Object();
		
		OZUtil.OZCallFunction(OZViewerID,"Document_GetTitle",JSON.stringify(eventParam),callback);
	},
	Document_GetPaperWidth : function(OZViewerID,callback){
		var eventParam = new Object();		
		
		OZUtil.OZCallFunction(OZViewerID,"Document_GetPaperWidth",JSON.stringify(eventParam),callback);
	},	
	Document_GetPaperHeight : function(OZViewerID,callback){
		var eventParam = new Object();		
		
		OZUtil.OZCallFunction(OZViewerID,"Document_GetPaperHeight",JSON.stringify(eventParam),callback);
	},	
	Document_PingOZServer : function(OZViewerID,key,port,callback){
		var eventParam = new Object();
		eventParam.arg1 = key;
		eventParam.arg2 = port;		
		
		OZUtil.OZCallFunction(OZViewerID,"Document_PingOZServer",JSON.stringify(eventParam),callback);
	},	
	Document_GetGlobal : function(OZViewerID,key,docIndex,callback){
		var eventParam = new Object();
		eventParam.arg1 = key;
		eventParam.arg2 = docIndex;		
		
		OZUtil.OZCallFunction(OZViewerID,"Document_GetGlobal",JSON.stringify(eventParam),callback);
	},		
	Document_TriggerExternalEvent : function(OZViewerID,param1,param2,param3,param4,callback){
		var eventParam = new Object();
		eventParam.arg1 = param1;
		eventParam.arg2 = param2;		
		eventParam.arg3 = param3;
		eventParam.arg4 = param4;
		
		OZUtil.OZCallFunction(OZViewerID,"Document_TriggerExternalEvent",JSON.stringify(eventParam),callback);
	},	
	Document_TriggerExternalEventByDocIndex : function(OZViewerID,docIndex,param1,param2,param3,param4,callback){
		var eventParam = new Object();
		eventParam.arg1 = docIndex;
		eventParam.arg2 = param1;
		eventParam.arg3 = param2;		
		eventParam.arg4 = param3;
		eventParam.arg5 = param4;
		
		OZUtil.OZCallFunction(OZViewerID,"Document_TriggerExternalEventByDocIndex",JSON.stringify(eventParam),callback);
	},	
	Document_TriggerLocationUpdated : function(OZViewerID,location,address, callback){
		var eventParam = new Object();
		eventParam.arg1 = location;
		eventParam.arg2 = address;
		
		OZUtil.OZCallFunction(OZViewerID,"Document_TriggerLocationUpdated",JSON.stringify(eventParam),callback);
	},	
	Document_TriggerLocationUpdatedByDocIndex : function(OZViewerID,docIndex, location,address, callback){
		var eventParam = new Object();
		eventParam.arg1 = docIndex;
		eventParam.arg2 = location;
		eventParam.arg3 = address;
		
		OZUtil.OZCallFunction(OZViewerID,"Document_TriggerLocationUpdated",JSON.stringify(eventParam),callback);
	},		
	
	OZCallFunction : function(OZViewerID, fname, args, callback) {
		var OZMap = OZUtil.OZViewerMap[OZViewerID];
		if (OZMap) {
			
			// CallFunction이 호출 시, 해당 요청을 queue에 등록한다.
			OZUtil.addCallFunctionListener(OZViewerID, fname, args, callback);
			
			// callfuntion이 처리중이 아닌 경우, 해당 요청을 실행한다.
			if( false == OZMap[3] )
			{
				OZUtil.runCallFunction(OZViewerID);
			}
		}
	},
	
	runCallFunction: function (OZViewerID)
	{
		var OZMap = OZUtil.OZViewerMap[OZViewerID];
		if (OZMap) {	
			var EXEVeiwerCallFunctions = OZUtil.EXEVeiwerCallFunctionsForViewerID[OZViewerID];
			if(EXEVeiwerCallFunctions == undefined)
			{
				OZMap[3] = false;
				return;
			}
			
			if(EXEVeiwerCallFunctions.length <= 0)
			{
				OZMap[3] = false;
				return;
			}
			
			// queue의 첫 번째 항목을 추출하여 이벤트 설정
			OZMap[3] = true;
			OZUtil.EXEViewerFuncCB = null;
			var obj  = EXEVeiwerCallFunctions[0];
			if(obj.callback != null)
			{
				OZUtil.EXEViewerFuncCB = obj.callback;
			}
		
			var eventParam = new Object();
			eventParam.fname = obj.fname;
			eventParam.params = obj.args;
			eventParam.ozexeviewerhandle = OZMap[1];
			eventParam.ozeventkey = OZMap[2];
			
			// queue의 첫번째 항목 삭제
			EXEVeiwerCallFunctions.splice(0, 1);
	
			var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
			if (verNumber > 10 || verNumber == -1) {
				OZUtil.OZCallFunction_WS(OZViewerID, eventParam);
			} else {
				var _param = JSON.stringify(eventParam);
				var _params = OZUtil.splitparam(_param);
				var strHeader;
	
				var packet = new Object();
				var packetindex = 0;
				packet.type = "pkt_fnc";
				packet.totalcount = _params.length - 1;
				packet.index = packetindex;
				packet.data = _params[packetindex++];
				packet.guid = OZUtil.guid();
	
				OZUtil.OZEXEViewerRun_SendPacket_Fnc(packet, _params, packetindex, OZViewerID);
			}
		}
	},
	
	addCallFunctionListener: function (OZViewerID, fname, args, callback)
	{
		var EXEVeiwerCallFunctions = OZUtil.EXEVeiwerCallFunctionsForViewerID[OZViewerID];
		if(EXEVeiwerCallFunctions == undefined)
		{
			EXEVeiwerCallFunctions = [];
		}
		
		var callFuntionParam = new Object();
		callFuntionParam.fname = fname;
		callFuntionParam.args = args;
		callFuntionParam.callback = callback;
		
		EXEVeiwerCallFunctions.push(callFuntionParam);
		OZUtil.EXEVeiwerCallFunctionsForViewerID[OZViewerID] = EXEVeiwerCallFunctions;		
	},
	
	GetLocalPrinterInfo : function(namespace,callback) {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.GetLocalPrinterInfo_WS(namespace,callback);
		} 
		else {
			OZUtil.GetLocalPrinterInfo_HTTP(namespace, callback);
		}
		
	},
	GetLocalPrinterInfo_WS : function(namespace, callback) {
		var CONNECTION = OZUtil.GetConnection();
		if(_isHttpMode)
		{
			OZUtil.GetLocalPrinterInfo_HTTP(namespace, callback);
			return;
		}
		
		var runObject = new Object();
		runObject.namespace = namespace;
		
		
		CONNECTION.onopen = function() {
			CONNECTION.send("PRT:"+ JSON.stringify(runObject));
		};
		
		var _isClose = false;
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			if(!_isClose)
			{
				var jsonInfo = {};
				callback(jsonInfo);
			}
		};
		// Log messages from the server
		CONNECTION.onmessage = function(e) {
			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {
				var result = e.data.substring(4, e.data.length);
				
				var jsonInfo = {};
				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
					
					jsonInfo = JSON.parse(result(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				
				callback(jsonInfo);
			}
		};
	},
	GetLocalPrinterInfo_HTTP : function(namespace, callback) {
		
		var runObject = new Object();
		runObject.namespace = namespace;
		
		var param = new Object();
		param.type = "prt";
		param.data = JSON.stringify(runObject);
		param.guid = OZUtil.guid();
		
		var url  = OZUtil.getRequestURL();
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(JSON.stringify(param)), true);

			 xdr.onerror = function() {
				var jsonInfo = {};
				callback(jsonInfo);
			};
			xdr.ontimeout = function () { 
				var jsonInfo = {};
				callback(jsonInfo);
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				
				callback(jsonInfo);
/*				
				if (jsonInfo.version < launcherversion) {
					InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					OZUtil.StartUpdate_HTTP( ztParam, StartOZViewer);
				} else {
					InstallOZWebLauncher();
				}
*/				
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
				
			window[callbackMethod] = (function (Args_callback, jsonInfo) {
				Args_callback(jsonInfo);
/*				
				if (jsonInfo.version < Args_launcherversion) {
						Args_InstallOZWebLauncher();
				}
				else if (jsonInfo.result == "OK") {
					OZUtil.StartUpdate_HTTP( Args_ztParam, Args_StartOZViewer);
				} else {
					Args_InstallOZWebLauncher();
				}
*/				
			}).bind(null, callback);
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				//InstallOZWebLauncher();
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			script.src = url + encodeURIComponent(JSON.stringify(param)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}	
	},
	CloseAllEXEViewer : function() {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.CloseAllEXEViewer_WS();
		} 
		else {
			OZUtil.CloseAllEXEViewer_HTTP();
		}
		
	},
	CloseAllEXEViewer_WS : function() {

		var CONNECTION = OZUtil.GetConnection();
		if(_isHttpMode)
		{
			OZUtil.DisposeAllViewer_HTTP();
			return;
		}
		CONNECTION.onopen = function() {
			var packet = new Object();
			packet.type = "CLR";
			CONNECTION.send("CLR:" + JSON.stringify(packet));
			CONNECTION.close();
		};

		var _isClose = false;
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			if(!_isClose)
			{
				//InstallOZWebLauncher();
			}
		};
	},
	CloseAllEXEViewer_HTTP : function() {
		var packet = new Object();
		packet.type = "CLR";
		OZUtil.Cmd_SendPacket(JSON.stringify(packet));
	},
	
	
	
	StartInstallViewer_core : function(fncParam,installViewer_core, InstallOZWebLauncher){
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			return OZUtil.StartInstallViewer_WS(installViewer_core, InstallOZWebLauncher,fncParam);
		} else {
			OZUtil.StartInstallViewer_HTTP(installViewer_core, InstallOZWebLauncher,fncParam);
		}
	},
	StartInstallViewer_WS : function(callbackFnc, InstallOZWebLauncher,fncParam)
	{
		var CONNECTION = null;
		var cur_protocolName = window.location.protocol;
		var url;
		if (cur_protocolName == 'https:') {
			url = 'wss://127.0.0.1:36509/ozutil';
		} else {
			url = 'ws://127.0.0.1:36479/ozutil';
		}
		try {
			CONNECTION = new WebSocket(url);
		} catch (e) {
			console.log("Error :: fail to create socket");
			_isHttpMode = true;
			console.log(e);
		}

		CONNECTION.onopen = function() {
		
			CONNECTION.send("req_port");
		};
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			console.log("error in EXEViewer run");
			InstallOZWebLauncher();
		};

		// Log messages from the server
		CONNECTION.onmessage = function(e) {
			
			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {
				var result = e.data.substring(4, e.data.length);
				
				var jsonInfo = {};
				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
				
					jsonInfo = JSON.parse(result(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				_port = jsonInfo.port;
				_sslport = jsonInfo.sslport;
				
				CONNECTION.close();
				if(fncParam == undefined)
				{
					callbackFnc();
				}
				else
				{
					callbackFnc(fncParam,InstallOZWebLauncher);
				}
			}
		};
	},
	getRequestUtilURL : function(){
		
		var cur_protocolName = window.location.protocol;
		var url = "";
		if (cur_protocolName === 'https:') {
			url = "https://127.0.0.1:36509/ozutil";
		} else {
			url = "http://127.0.0.1:36479/ozutil";

		}
		return url;
	},
	StartInstallViewer_HTTP : function(OZStartViewer, InstallOZWebLauncher) {
		var checkParam = new Object();
		checkParam.type = "req_port";
		checkParam.guid = OZUtil.guid();
		
		var url  = OZUtil.getRequestUtilURL();
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(JSON.stringify(checkParam)), true);

			 xdr.onerror = function() {
				InstallOZWebLauncher();
			};
			xdr.ontimeout = function () { 
				InstallOZWebLauncher();
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				_port = jsonInfo.port;
				_sslport = jsonInfo.sslport;
				OZStartViewer();
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
				
			window[callbackMethod] = (function (Args_OZStartViewer, jsonInfo) {
				
				_port = jsonInfo.port;
				_sslport = jsonInfo.sslport;
				Args_OZStartViewer();
				
			}).bind(null, OZStartViewer);
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				InstallOZWebLauncher();
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			script.src = url + encodeURIComponent(JSON.stringify(checkParam)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
	},
	
	
	StartInstallViewer : function(OZStartViewer, InstallOZWebLauncher) {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		
		if (verNumber > 10 || verNumber == -1) {
			return OZUtil.StartInstallViewer_WS(OZStartViewer, InstallOZWebLauncher);
		} else {
			OZUtil.StartInstallViewer_HTTP(OZStartViewer, InstallOZWebLauncher);
		}
	},
		

	getRequestAdURL : function(){
		
		var cur_protocolName = window.location.protocol;
		var url = "";
		if (cur_protocolName === 'https:') {
			url = "https://127.0.0.1:" + _sslport +"/ozadservice";
		} else {
			url = "http://127.0.0.1:" + _port +"/ozadservice";
		}
		return url;
		
	},
	GetAdConnection : function() {
		
		var CONNECTION = null;
		var cur_protocolName = window.location.protocol;
		var url;
		if (cur_protocolName == 'https:') {
			url = 'wss://127.0.0.1:' + _sslport +'/ozadservice';
		} else {
			url = 'ws://127.0.0.1:' + _port +'/ozadservice';
		}
		try {
			CONNECTION = new WebSocket(url);
		} catch (e) {
			console.log("Error :: fail to create socket");
			_isHttpMode = true;
			console.log(e);
		}
		return CONNECTION;
	},
	
	startNScreenAD_HTTP : function(id, option, path) {
		
		var runObject = new Object();
		runObject.type = "RAD";
		runObject.option = option;
		
		if(path !== undefined)
				runObject.path = path;
		
		var url  = OZUtil.getRequestAdURL();
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(JSON.stringify(runObject)), true);

			 xdr.onerror = function() {
				console.log("fail to send rad parameter. (error)");
			};
			xdr.ontimeout = function () { 
				console.log("fail to send rad parameter. (timeout)");
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				_port = jsonInfo.port;
				_sslport = jsonInfo.sslport;
				OZStartViewer();
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{
			var callbackMethod = 'callback_' + new Date().getTime();
				
			window[callbackMethod] = (function (Args_ID, Args_option, jsonInfo) {
				if (jsonInfo.result == "OK") {
					OZUtil.OZNScreenAdMap[Args_ID] = [null, jsonInfo.adhandle,jsonInfo.adkey,false];
					OZUtil.OZNScreenAd_IDs.push(Args_ID);		
				} else {
					console.log(jsonInfo.reason);
				}
				
			}).bind(null, id, option);
			
			var callbackErrorMethod = callbackMethod + "_error";
			window[callbackErrorMethod] = function(e) {
				console.log("fail to send rad parameter");
			};
			
			var script = document.createElement('script');
			script.onerror = window[callbackErrorMethod];
			script.src = url + encodeURIComponent(JSON.stringify(runObject)) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
	},
	
	startNScreenAD_WS : function(id, option, path) {
		var CONNECTION = OZUtil.GetAdConnection();
		
		if(_isHttpMode){
			OZUtil.StartNScreenAD_HTTP(id, option);
			return;
		}
		
		CONNECTION.onopen = function() {
			var runObject = new Object();
			runObject.option = option;
			
			if(path !== undefined)
				runObject.path = path;

			CONNECTION.send("RAD:" + JSON.stringify(runObject));
		};
		
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			console.log("error in NScreenAD run");
		};

		// Log messages from the server
		CONNECTION.onmessage = function(e) {
			var cmdtype = e.data.substring(0, 3);
			if (cmdtype == "RET") {

				var result = e.data.substring(4, e.data.length);
				var jsonInfo = {};

				try {
					jsonInfo = JSON.parse(result);
				} catch (e) {
					
					jsonInfo = JSON.parse(result.replace(new RegExp(String.fromCharCode(8), "g"), "").replace(new RegExp("\\u000b", "g"), ""));
				}
				
				if (jsonInfo.result == "OK") {
					OZUtil.OZNScreenAdMap[id] = [CONNECTION, jsonInfo.adhandle,jsonInfo.adkey,false];
					OZUtil.OZNScreenAd_IDs.push(id);					
				} else {
					console.log(jsonInfo.reason);
				}
			}
		};
	},
	
	startNScreenAD : function(id, option, path) {
		var ADMap = OZUtil.OZNScreenAdMap[id];
		if(ADMap)
		{
			console.log("AD already running");
			return;
		}
		
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.startNScreenAD_WS(id, option, path);
		} else {
			OZUtil.startNScreenAD_HTTP(id, option, path);
		}
	},
	
	closeNScreenAD_HTTP : function(id) {
		var ADMap = OZUtil.OZNScreenAdMap[id];
		if(ADMap)
		{
			var packet = new Object();
			packet.type = "EAD";
			packet.adhandle = ADMap[1];
			packet.adkey = ADMap[2];
			
			// 종료 이벤트 전달
			OZUtil.Cmd_SendNScreenADPacket(JSON.stringify(packet));
			
			// Clean up NScreenAD IDs
			var idx = OZUtil.OZNScreenAd_IDs.indexOf(id);
			if(idx > -1)
			{
				OZUtil.OZNScreenAd_IDs.splice(idx, 1);
			}
			
			// Clean up NScreenAD map 
			delete OZUtil.OZNScreenAdMap[id];
		}
	},
	closeNScreenAD_WS : function(id) {
		var ADMap = OZUtil.OZNScreenAdMap[id];
		if(ADMap)
		{
			var packet = new Object();
			packet.adhandle = ADMap[1];
			packet.adkey = ADMap[2];
			
				
			var CONNECTION = ADMap[0];
			if(CONNECTION != null)
			{
				CONNECTION.send("EAD:" + JSON.stringify(packet));
				CONNECTION.close();
			}
			
			// Clean up NScreenAD IDs
			var idx = OZUtil.OZNScreenAd_IDs.indexOf(id);
			if(idx > -1)
			{
				OZUtil.OZNScreenAd_IDs.splice(idx, 1);
			}
			
			// Clean up NScreenAD map 
			delete OZUtil.OZNScreenAdMap[id];
		}
	},
	closeNScreenAD : function(id) {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.closeNScreenAD_WS(id);
		} else {
			OZUtil.closeNScreenAD_HTTP(id);
		}
	},
	

	closeAllNScreenAD : function() {
		var verNumber = parseInt(OZUtil.GetIEVersion(), 10);
		if (verNumber > 10 || verNumber == -1) {
			OZUtil.closeAllNScreenAD_WS();
		} 
		else {
			OZUtil.closeAllNScreenAD_HTTP();
		}
		
		var arr = OZUtil.OZNScreenAd_IDs;
		if(arr != null)
		{
			for(var i =0; i < arr.length; i ++)
			{
				var obj  = OZUtil.OZNScreenAdMap[arr[i]];
				OZUtil.CloseExeViewerSocket(obj[0]);
				delete OZUtil.OZNScreenAdMap[arr[i]];
			}	
		}
		
		if(OZUtil.OZNScreenAd_IDs.length > 0)
		{
			OZUtil.OZNScreenAd_IDs.splice(0, OZUtil.OZNScreenAd_IDs.length);
		}
	},
	closeAllNScreenAD_WS : function() {

		var CONNECTION = OZUtil.GetAdConnection();
		if(_isHttpMode)
		{
			OZUtil.DisposeAllViewer_HTTP();
			return;
		}
		CONNECTION.onopen = function() {
			var packet = new Object();
			packet.type = "CAD";
			CONNECTION.send("CAD:" + JSON.stringify(packet));
			CONNECTION.close();
		};

		var _isClose = false;
		// when the connection is closed by the server
		CONNECTION.onclose = function(e) {

		};
		// Log errors
		CONNECTION.onerror = function(e) {
			if(!_isClose)
			{
				
			}
		};
	},
	closeAllNScreenAD_HTTP : function() {
		var packet = new Object();
		packet.type = "CAD";
		OZUtil.Cmd_SendNScreenADPacket(JSON.stringify(packet));
	},
	
	Cmd_SendNScreenADPacket : function(packetstr) {

		var url  = OZUtil.getRequestAdURL();
		if(OZUtil.GetIEVersion() < 9 && OZUtil.GetIEVersion() != -1)
		{
			var xdr = OZUtil.createXDRHttpRequest();
			
			xdr.open("GET", url + encodeURIComponent(packetstr), true);

			 xdr.onerror = function() {
				console.log("fail to send packet");
			};
			xdr.ontimeout = function () { 
				console.log("fail to send packet");
			};
			
			xdr.onload = function () { 
				var jsonInfo = JSON.parse(xdr.responseText);
				console.log(jsoninfo);
			};
			setTimeout(function () {
				xdr.send();
			  }, 0);
		}
		else{

			var callbackMethod = 'callback_' + new Date().getTime();
			window[callbackMethod] = (function(jsonInfo){
				if (jsonInfo.isFinish == "true") {
					console.log("NScreenAD closed");
				}
			}).bind(null);
			
			//var callbackMethod = 'callback_' + new Date().getTime();
			//window[callbackMethod] = function(jsonInfo){
			//	console.log(jsoninfo);
			//}
			
			var callbackErrorMethod = callbackMethod + "_error";
				window[callbackErrorMethod] = function(e) {
					console.log("fail to send NScreenAD packet");
				};
				
				var script = document.createElement('script');
				script.onerror = window[callbackErrorMethod];
				
			script.src = url +  encodeURIComponent(packetstr) + '?callback='+callbackMethod;
			document.body.appendChild(script);
		}
	},
	
	ReleaseNScreenAD : function(){
	
		var arr = OZUtil.OZNScreenAd_IDs;
		if(arr != null)
		{
			for(var i =0; i < arr.length; i ++)
			{
				var obj  = OZUtil.OZNScreenAdMap[arr[i]];
				OZUtil.CloseExeViewerSocket(obj[0]);
				
			}	
		}
		OZUtil.OZNScreenAd_IDs = null;
		OZUtil.OZNScreenAdMap = null;
	},
	
	ReleaseViewer : function(){
	
		var arr = OZUtil.OZOZViewerIDs;
		if(arr != null)
		{
			for(var i =0; i < arr.length; i ++)
			{
				var obj  = OZUtil.OZViewerMap[arr[i]];
				OZUtil.CloseExeViewerSocket(obj[0]);
				
			}	
		}
		OZUtil.OZOZViewerIDs = null;
		OZUtil.OZViewerMap = null;
		OZUtil.EXEVeiwerCallFunctionsForViewerID = null;
	}
	
};

window.onbeforeunload = function(e) {
	
	OZUtil.ReleaseViewer();
	OZUtil.ReleaseNScreenAD();
	
}
return OZUtil;}());
