var WebrtcC = UCPMC.extend({
	init: function() {
		this.windowId = null;
		this.phone = null;
		this.activeCalls = {};
		this.activeCallId = null;
		this.answering = false;
		this.stick = false;
		this.enableHold = false;
		this.disconnected = false;
		this.callBinds = [
			"progress",
			"started",
			"ended",
			"failed",
			"newDTMF"
		];

		this.callOptions = {
			"mediaConstraints": {
				"audio": true,
				"video": false
			}
		};

		this.notification = null;
	},
	settingsDisplay: function() {

	},
	settingsHide: function() {

	},
	contactClickOptions: function(type) {
		if (type != "number" || !this.staticsettings.enableOriginate) {
			return false;
		}
		return [ { text: _("Originate Call"), function: "contactClickInitiate", type: "phone" } ];
	},
	contactClickInitiate: function(did) {
		var Webrtc = this,
				sfrom = "",
				temp = "",
				name = did,
				selected = "";
		if (UCP.validMethod("Contactmanager", "lookup")) {
			if (typeof UCP.Modules.Contactmanager.lookup(did).displayname !== "undefined") {
				name = UCP.Modules.Contactmanager.lookup(did).displayname;
			} else {
				temp = String(did).length == 11 ? String(did).substring(1) : did;
				if (typeof UCP.Modules.Contactmanager.lookup(temp).displayname !== "undefined") {
					name = UCP.Modules.Contactmanager.lookup(temp).displayname;
				}
			}
		}
		$.each(Webrtc.staticsettings.extensions, function(i, v) {
			sfrom = sfrom + "<option>" + v + "</option>";
		});

		selected = "<option value=\"" + did + "\" selected>" + name + "</option>";
			UCP.showDialog(_("Originate Call"),
			"<label for=\"originateFrom\">From:</label> <select id=\"originateFrom\" class=\"form-control\">" + sfrom + "</select><label for=\"originateTo\">To:</label><select class=\"form-control Tokenize Fill\" id=\"originateTo\" multiple>" + selected + "</select><button class=\"btn btn-default\" id=\"originateCall\" style=\"margin-left: 72px;\">" + _("Originate") + "</button>",
			200,
			250,
			function() {
				$("#originateTo").tokenize({ maxElements: 1, datas: "index.php?quietmode=1&module=webrtc&command=contacts" });
				$("#originateCall").click(function() {
					setTimeout(function() {
						UCP.Modules.Webrtc.originate();
					}, 50);
				});
				$("#originateTo").keypress(function(event) {
					if (event.keyCode == 13) {
						setTimeout(function() {
							UCP.Modules.Webrtc.originate();
						}, 50);
					}
				});
			}
		);
	},
	engineEvent: function(event) {
		console.log("Engine " + event.type);
		switch (event.type){
			case "newRTCSession":
				this.manageSession(event);
			break;
			case "connecting":
				$("#nav-btn-webrtc .fa-phone").css("color", "yellow");
			break;
			case "connected":
				$("#nav-btn-webrtc .fa-phone").css("color", "green");
			break;
			case "unregistered":
			case "registrationFailed":
				$("#nav-btn-webrtc .fa-phone").css("color", "red");
			break;
		}
	},
	setPhone: function(stick, s, m) {
		if (typeof stick !== "undefined" && stick) {
			this.stick = true;
		}
		var Webrtc = this,
				message = (typeof m !== "undefined") ? m : "",
				state = (typeof s !== "undefined") ? s : "call";
		if (this.windowId === null) {
			this.windowId = Math.floor((Math.random() * 1000) + 1);
		}
		if ($( "#messages-container .phone-box[data-id=\"" + this.windowId + "\"]").length === 0) {
			UCP.addPhone("Webrtc", this.windowId, state, message, this.contactOptions, function(id, state, message) {
				$("#messages-container .phone-box[data-id=\"" + Webrtc.windowId + "\"] .contactDisplay .contactInfo span").text(message);
				$("#messages-container .phone-box[data-id=\"" + Webrtc.windowId + "\"] .contactDisplay .contactInfo").textfill();
				Webrtc.switchState(state);
			});
		} else {
			$( "#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .message").text(message);
			$("#messages-container .phone-box .message-container").textfill();
			$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay .contactInfo span").text(message);
			$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay .contactInfo").textfill();
			Webrtc.switchState(state);
		}
	},
	playRing: function() {
		$("#ringtone").trigger("play");
	},
	stopRing: function() {
		$("#ringtone").trigger("pause");
		$("#ringtone").trigger("load");
	},
	manageSession: function(e) {
		var Webrtc = this,
				id,
				cnam,
				cnum,
				displayName,
				status,
				request = e.data.request,
				call = e.data.session,
				uri = call.remote_identity.uri;

		id = Math.floor((Math.random() * 100000) + 1);
		// If the session exists with active call reject it.
		// TODO this can be useful for call waiting
		if (!this.enableHold && this.activeCallId) {
			call.terminate();
			return false;
		}

		// If this is a new session create it
		if (!this.activeCallId) {
			this.activeCallId = id;
			this.activeCalls[id] = call;
		}

		cnam = this.activeCalls[id].remote_identity.display_name || "";
		cnum = this.activeCalls[id].remote_identity.uri.user;
		displayName = (cnam !== "") ? cnam + " <" + cnum + ">" : cnum;
		if (this.activeCalls[id].direction === "incoming") {
			this.setPhone(false, "answer", "From: " + displayName);
			if (UCP.notify) {
				this.notification = new Notify("Incoming call from " + displayName, {
					body: "Click this window to answer or close this window to ignore",
					icon: "modules/Faxpro/assets/images/fax.png",
					notifyClose: function() {
						if (Webrtc.answering) {
							Webrtc.answering = false;
						} else {
							Webrtc.hangup();
						}
					},
					notifyClick: function() {
						Webrtc.answering = true;
						Webrtc.answer();
						Webrtc.notification.close();
					}
				});
				this.notification.show();
			}
		}

		$.each(this.callBinds, function(i, v) {
			Webrtc.activeCalls[Webrtc.activeCallId].on(v, function(e) {
				Webrtc.sessionEvent(e);
			});
		});
	},
	sessionEvent: function(event) {
		console.log("Session " + event.type);
		switch (event.type){
			case "failed":
				this.endCall(event);
				UCP.removeGlobalMessage();
			break;
			case "ended":
				this.endCall(event);
				UCP.removeGlobalMessage();
			break;
			case "confirmed":
			case "started":
				this.startCall(event);
			break;
			case "connecting":
			case "progress":
				this.switchState("progress");
			break;
		}
	},
	endCall: function(event) {
		this.activeCalls[this.activeCallId] = null;
		this.activeCallId = null;
		if (!this.stick) {
			UCP.removePhone(this.windowId);
			this.windowId = null;
		} else {
			this.switchState();
		}
		if (this.notification !== null) {
			this.notification.close();
		}
		this.stopRing();
	},
	startCall: function(event) {
		var rtcSession = event.sender,
				call = event.data.session,
				displayName;

		// Attach remote stream to remoteView
		if (rtcSession.getRemoteStreams().length > 0) {
			//Create object url is depreciated. warning
			$("#audio_remote").prop("src", window.URL.createObjectURL(rtcSession.getRemoteStreams()[0]));
			this.switchState("hangup");
			if (this.notification !== null) {
				this.notification.close();
			}
		}
		this.stopRing();
	},
	call: function(number) {
		if (this.phone.isConnected()) {
			if (!this.enableHold) {
				this.switchState("connecting");
			}
			this.phone.call(number, this.callOptions);
		}
	},
	answer: function() {
		if (this.activeCallId !== null) {
			this.answering = true;
			this.switchState("connecting");
			this.activeCalls[this.activeCallId].answer(this.callOptions);
		}
	},
	toggleHold: function() {
		if (this.activeCallId !== null) {
			var call = this.activeCalls[this.activeCallId],
					holds = this.activeCalls[this.activeCallId].isOnHold(),
					button = $("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window button.secondaction");
			if (!holds.local) {
				button.removeClass().addClass("btn btn-warning secondaction");
				button.text("Unhold");
				call.hold();
			} else {
				button.removeClass().addClass("btn btn-success secondaction");
				button.text("Hold");
				call.unhold();
			}
		}
	},
	sendDTMF: function(num) {
		if (this.activeCallId !== null) {
			this.activeCalls[this.activeCallId].sendDTMF(num);
		}
	},
	hangup: function() {
		if (this.activeCallId !== null) {
			this.activeCalls[this.activeCallId].terminate();
		}
		this.stopRing();
	},
	poll: function(data) {

	},
	display: function(event) {

	},
	hide: function(event) {

	},
	switchState: function(t) {
		var button = $("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window button.action"),
				secondbutton = $("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window button.secondaction"),
				input = $("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window input.dialpad"),
				type = (typeof t !== "undefined") ? t : "call";
		button.data("type", type);
		switch (type){
			case "connecting":
				this.stopRing();
				$(".contactInfo span").text("Connecting Please Wait...");
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .activeCallSession").hide();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay").show();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window .actions .right").hide();
				input.prop("disabled", true);
				button.prop("disabled", false);
				button.removeClass().addClass("btn btn-danger action").text("Hangup");
			break;
			case "progress":
				this.playRing();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .activeCallSession").hide();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay").show();
				input.prop("disabled", true);
				button.prop("disabled", false);
				button.removeClass().addClass("btn btn-danger action").text("Hangup");
			break;
			case "answer":
				this.playRing();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .activeCallSession").hide();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay").show();
				secondbutton.removeClass().addClass("btn btn-danger secondaction").text("Ignore");
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window .actions .right").show();
				input.prop("disabled", true);
				button.prop("disabled", false);
				button.removeClass().addClass("btn btn-success action").text("Answer");
			break;
			case "hangup":
				this.stopRing();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .activeCallSession").show();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay").hide();
				if (this.enableHold) {
					secondbutton.removeClass().addClass("btn btn-success secondaction").text("Hold");
					$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window .actions .right").show();
				} else {
					$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window .actions .right").hide();
				}
				input.prop("disabled", false);
				button.prop("disabled", false);
				button.removeClass().addClass("btn btn-danger action").text("Hangup");
			break;
			default:
				this.stopRing();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .activeCallSession").show();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .contactDisplay").hide();
				$("#messages-container .phone-box[data-id=\"" + this.windowId + "\"] .window .actions .right").hide();
				input.prop("disabled", false);
				button.prop("disabled", true);
				button.removeClass().addClass("btn btn-primary action").text("Call");
			break;
		}
	},
	connect: function() {
		if ((typeof this.staticsettings !== "undefined") &&
				this.staticsettings.enabled &&
				Modernizr.getusermedia &&
				this.disconnected) {
			this.phone.start();
		}
	},
	disconnect: function() {
		this.disconnected = true;
		if (this.phone !== null && this.phone.isConnected()) {
			this.phone.stop();
		}
	},
	originate: function() {
		if ($("#originateTo").val() !== null && $("#originateTo").val()[0] === "") {
			alert(_("Nothing Entered"));
			return;
		}
		$.post( "index.php?quietmode=1&module=webrtc&command=originate",
						{ from: $("#originateFrom").val(),
						to: $("#originateTo").val()[0] },
						function( data ) {
							if (data.status) {
								UCP.closeDialog();
							}
						}
		);
	}
});
$(document).bind("staticSettingsFinished", function( event ) {
	if ((typeof UCP.Modules.Webrtc.staticsettings !== "undefined") && UCP.Modules.Webrtc.staticsettings.enabled && Modernizr.getusermedia) {
		UCP.Modules.Webrtc.enableHold = UCP.Modules.Webrtc.staticsettings.settings.enableHold;
		var ver = (UCP.Modules.Webrtc.enableHold) ? "0.4.1" : "devel-0.3.7";
		$.getScript("modules/Webrtc/assets/jssiplibs/jssip-" + ver + ".js")
		.done(function( script, textStatus ) {
			$("#nav-btn-webrtc").removeClass("hidden");
			UCP.calibrateMenus();
			$("#footer").append("<audio id=\"audio_remote\" autoplay=\"autoplay\" />");
			$("#footer").append("<audio id=\"ringtone\"><source src=\"modules/Webrtc/assets/sounds/ring.mp3\" type=\"audio/mpeg\"></audio>");
			UCP.Modules.Webrtc.phone = new JsSIP.UA(
				{
					"ws_servers": UCP.Modules.Webrtc.staticsettings.settings.wsservers,
					"uri": UCP.Modules.Webrtc.staticsettings.settings.uri,
					"password": UCP.Modules.Webrtc.staticsettings.settings.password,
					"log": UCP.Modules.Webrtc.staticsettings.settings.log
				}
			);
			if (UCP.Modules.Webrtc.enableHold) {
				UCP.Modules.Webrtc.callBinds = [
					"progress",
					"ended",
					"failed",
					"newDTMF",
					"hold",
					"unhold",
					"connecting",
					"accepted",
					"confirmed"
				];
			}
			var binds = [
				"connected",
				"disconnected",
				"registered",
				"unregistered",
				"registrationFailed",
				"newRTCSession",
				"newMessage"
				];
			if (UCP.Modules.Webrtc.enableHold) {
				binds.push("connecting");
			}
			$.each(binds, function(i, v) {
				UCP.Modules.Webrtc.phone.on(v, function(e) {
					UCP.Modules.Webrtc.engineEvent(e);
				});
			});

			UCP.Modules.Webrtc.phone.start();
		})
		.fail(function( jqxhr, settings, exception ) {
			//could not load script, remove button
		});
	}
});
$(document).bind("logIn", function( event ) {
	$("#webrtc-menu li.web").on("click", function() {
		UCP.Modules.Webrtc.setPhone(true);
	});
	$("#settings-menu a.originate").on("click", function() {
		var sfrom = "";
		$.each(UCP.Modules.Webrtc.staticsettings.extensions, function(i, v) {
			sfrom = sfrom + "<option>" + v + "</option>";
		});

		UCP.showDialog(_("Originate Call"),
			"<label for=\"originateFrom\">From:</label> <select id=\"originateFrom\" class=\"form-control\">" + sfrom + "</select><label for=\"originateTo\">To:</label><select class=\"form-control Tokenize Fill\" id=\"originateTo\" multiple></select><button class=\"btn btn-default\" id=\"originateCall\" style=\"margin-left: 72px;\">" + _("Originate") + "</button>",
			200,
			250,
			function() {
				$("#originateTo").tokenize({ maxElements: 1, datas: "index.php?quietmode=1&module=webrtc&command=contacts" });
				$("#originateCall").click(function() {
					setTimeout(function() {
						UCP.Modules.Webrtc.originate();
					}, 50);
				});
				$("#originateTo").keypress(function(event) {
					if (event.keyCode == 13) {
						setTimeout(function() {
							UCP.Modules.Webrtc.originate();
						}, 50);
					}
				});
			}
		);
	});
});
$(document).bind("phoneWindowRemoved", function( event ) {
	UCP.Modules.Webrtc.stick = false;
	this.windowId = null;
	UCP.Modules.Webrtc.hangup();
});
$(document).bind("phoneWindowAdded", function( event ) {
	$("#messages-container .phone-box .keypad td").click(function() {
		var text = $(".phone-box .dialpad").val() + $(this).data("num"),
				button = $(this).parents(".window").find("button.action");
		if (button.data("type") == "call" || button.data("type") == "hangup") {
			if (button.data("type") == "call") {
				$( "#messages-container .phone-box[data-id=\"" + UCP.Modules.Webrtc.windowId + "\"] .message").text("To: " + text);
			}
			$("#messages-container .phone-box .dialpad").val(text);
			UCP.Modules.Webrtc.sendDTMF($(this).data("num"));
			button.prop("disabled", false);
			$("#messages-container .phone-box .message-container").textfill();
		}
	});
	$("#messages-container .phone-box .clear-input").click(function() {
		var button = $(this).parents(".window").find("button.action");
		$("#messages-container .phone-box .dialpad").val("");
		if (button.data("type") == "call") {
			$( "#messages-container .phone-box[data-id=\"" + UCP.Modules.Webrtc.windowId + "\"] .message").text("");
			button.prop("disabled", true);
		}
	});
	$("#messages-container .phone-box .dialpad").keyup(function() {
		var button = $(this).parents(".window").find("button.action"),
				text = $(".phone-box .dialpad").val();
		if ($(this).val().length === 0 && (button.data("type") == "call")) {
			$( "#messages-container .phone-box[data-id=\"" + UCP.Modules.Webrtc.windowId + "\"] .message").text("");
			button.prop("disabled", true);
		} else {
			$( "#messages-container .phone-box[data-id=\"" + UCP.Modules.Webrtc.windowId + "\"] .message").text("To: " + text);
			UCP.Modules.Webrtc.sendDTMF(text.slice(-1));
			button.prop("disabled", false);
		}
		$("#messages-container .phone-box .message-container").textfill();
	});
	$("#messages-container .phone-box button.action").click(function() {
		var type = $(this).data("type"),
				num = $("#messages-container .phone-box .dialpad").val();
		switch (type) {
			case "call":
				UCP.Modules.Webrtc.call(num);
			break;
			case "progress":
			case "hangup":
				UCP.Modules.Webrtc.hangup();
			break;
			case "answer":
				UCP.Modules.Webrtc.answer();
			break;
		}
	});
	$("#messages-container .phone-box button.secondaction").click(function() {
		var type = $("#messages-container .phone-box button.action").data("type");
		switch (type) {
			case "hangup":
				UCP.Modules.Webrtc.toggleHold();
			break;
			case "answer":
				UCP.Modules.Webrtc.hangup();
			break;
		}
	});
	$("#messages-container .phone-box .message-container").textfill();
});
$(document).bind("logOut", function( event ) {
	if (typeof UCP.Modules.Webrtc !== "undefined" && UCP.Modules.Webrtc.phone !== null && UCP.Modules.Webrtc.phone.isConnected()) {
		UCP.Modules.Webrtc.phone.stop();
	}
});

$(window).bind("beforeunload", function() {
	if (typeof UCP.Modules.Webrtc !== "undefined" && UCP.Modules.Webrtc.phone !== null && UCP.Modules.Webrtc.phone.isConnected()) {
		UCP.Modules.Webrtc.phone.stop();
	}
});
