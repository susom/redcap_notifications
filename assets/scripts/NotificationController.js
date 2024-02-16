class NotificationController {
    default_polling_int = 30000; //30 seconds
    redcap_notif_storage_key; //Index for localstorage notification payload
    user;
    parent; //ExternalModules.Stanford[REDCapNotifications];
    snooze_duration;
    refresh_limit;
    page;
    project_id;
    dev_prod_status;
    serverOK = true; //If EM goes offline, flag
    force_refresh = null;

    php_session;

    payload = { //Default payload structure
        "server": { "updated": null },
        "client": {
            "downloaded": null,
            "offset_hours": null,
        },
        "notifs": [],
        "snooze_expire": { "banner": null, "modal": null }
    };

    banner_jq = null;
    modal_jq = null;
    notif_objs = [];
    refreshFromServerRef = null;

    constructor({
                    current_user,
                    dev_prod_status,
                    page,
                    parent,
                    project_id,
                    refresh_limit,
                    snooze_duration,
                    php_session
                }) {


        this.user = current_user;
        this.parent = parent;
        this.snooze_duration = snooze_duration;
        this.refresh_limit = refresh_limit;
        this.page = page;
        this.project_id = project_id;
        this.dev_prod_status = dev_prod_status;
        this.redcap_notif_storage_key = `redcapNotifications_${this.user}`;
        this.php_session = php_session;

    }

    //Function called once to begin setInterval upon page load
    initialize() {
        //load and parse and show notifs
        this.loadNotifications();
        this.pollNotifsDisplay();
    }

    /**
     *
     */
    loadNotifications() {
        let _this = this;
        this.refreshFromServer().then(function (data) {
            let response = {}
            let arr = []

            for(let i in data) {
                if (i != "38_PROD:DEV_ALLUSERS_3") {
                    continue;
                }
                let parsed = JSON.parse(data[i])
                parsed['key'] = i
                arr.push(parsed)
            }


            response['notifs'] = arr
            if (response) {
                _this.parseNotifications(response);
            }
        }).catch(function (err) {
            console.log("error?", err)
        });
    }

    /**
     * Hit server endpoint for notification payload
     * @param notif_type
     * @returns {Promise<*>}
     */
    async refreshFromServer(notif_type) {
        // let _this   = this;
        let data    = {
            "last_updated": this.force_refresh ? null : this.getLastUpdate(),
            "project_id": this.project_id,
            "proj_or_sys": notif_type ?? "both",
            "user" : this.user
        };

        const response = await this.parent.callAjax2("get_full_payload", data)
        return response
    }

    parseNotifications(data) {
        let snooze_expire ;
        if (localStorage.getItem(this.redcap_notif_storage_key)) {
            this.payload = JSON.parse(localStorage.getItem(this.redcap_notif_storage_key));
            snooze_expire = this.payload.snooze_expire;
        }

        var client_date_time = getClientDateTime();
        var client_offset = getDifferenceInHours(new Date(data["server_time"]), new Date(client_date_time)) + "h";

        this.payload = {
            "server": { "updated": data["server_time"] },
            "client": {
                "downloaded": client_date_time,
                "offset_hours": client_offset,
            },
            "notifs": data["notifs"],
            "snooze_expire": snooze_expire
        };

        //fresh payload, need to clear out notifs cache.
        this.notif_objs = [];
        this.generateNotificationArray();

        if(!this.survey_payload){
            localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
        }

        //i just do this?
        this.showNotifications();
    }

    pollNotifsDisplay() {
        let _this = this;
        this.notifDisplayIntervalID = setInterval(function () {
             _this.showNotifications();
        }, this.default_polling_int);
    }

    // Generate array of notifications here for use later.
    generateNotificationArray() {
        if (this.payload.notifs.length) {
            for (var i in this.payload.notifs) {
                var notif = new Notification(this.payload.notifs[i], this);
                this.notif_objs.push(notif);
            }
        }
    }

    setEndpointFalse(err) {
        this.serverOK = false;
        if (err) {
            console.log(`Ajax has failed, disabling interval polling | Server OK: ${this.serverOK} | DismissIntervalID: ${this.DismissIntervalID} | ForceRefreshInterval: ${this.forceRefreshIntervalID}`);
            clearInterval(this.DismissIntervalID);
            clearInterval(this.forceRefreshIntervalID);
            clearInterval(this.notifDisplayIntervalID)
        }
    }

    /**
     * Take built UI and inject
     */
    showNotifications() {
        //Check against the snoozed notifs
        //Also check against FUTURE start time stamps
        if (!this.notif_objs.length) {
            return;
        }

        this.hideNotifs("banner");
        this.hideNotifs("modal");

        //rebuild everytime?
        this.buildNotifications();


        //actually inject banner_jq and modal_jq into the dom from buildNotifications.
        if (!this.isSnoozed("banner") && this.banner_jq && this.banner_jq.find(".notif.alert").length) {
            if (!$("#redcap_banner_notifs").length && ($("#subheader").length || $("#container").length)) {
                if (this.getCurPage() == "surveys/index.php") {
                    $("#container").prepend(this.banner_jq);
                } else {
                    if ($("#subheader").length) {
                        $("#subheader").after(this.banner_jq);
                    } else if ($("#control_center_window").length) {
                        $("#control_center_window").prepend(this.banner_jq);
                    } else if ($("#pagecontent .navbar").length) {
                        $("#pagecontent .navbar").after(this.banner_jq);
                    }

                }
            }
        }

        if (!this.isSnoozed("modal") && this.modal_jq && this.modal_jq.find(".notif.alert").length) {
            var opaque = $("<div>").prop("id", "redcap_notifs_blocker");
            if (!$("#redcap_notifs_blocker").length) {
                $("body").append(opaque);
                if (this.getCurPage() == "surveys/index.php") {
                    $("#container").append(this.modal_jq);
                } else {
                    $("body").append(this.modal_jq);
                }
            }
        }
    }

    hideNotifs(notif_type) {
        var _this = this;

        if (notif_type == "banner") {
            if (this.banner_jq) {
                this.banner_jq.addClass("hide");
                this.banner_jq.remove();
            }
            this.banner_jq = null;
        }

        if (notif_type == "modal") {
            if (this.modal_jq) {
                this.modal_jq.addClass("hide");
                this.modal_jq.remove();
            }
            _this.modal_jq = null;
            $("#redcap_notifs_blocker").remove();

        }
    }

    /**
     * Bind all onClick events to the banner notifications
     * @param banner JQuery variable containing the UI as String
     */
    bindBannerEvents(banner){
        let _this = this;

        banner.find(".dismiss_all").click(function () {
            if (banner.find(".dismissable").length) {
                banner.find(".dismissable .notif_hdr button").each(function () {
                    if ($(this).is(":visible")) {
                        $(this).trigger("click");
                    }
                });
            }
        });

        banner.find(".hide_notifs").click(function () {
            _this.hideNotifs("banner");
        });

        banner.find(".snooze").click(function () {
            _this.snoozeNotifs("banner");
            _this.hideNotifs("banner");
        });
    }

    /**
     * Bind all onClick events to the modal notifications
     * @param modal JQuery variable containing the UI as String
     */
    bindModalEvents(modal){
        let _this = this;

        modal.find(".dismiss_all").click(function () {
            // _this.parent.Log("dismmiss all dismissable modal", "debug");
            if (modal.find(".dismissable").length) {
                // _this.parent.Log("how many modal notifs to dismiss? " + html_cont["modal"].find(".dismissable .notif_hdr button").length, "debug");

                modal.find(".dismissable .notif_hdr button").each(function () {
                    if ($(this).is(":visible")) {
                        $(this).trigger("click");
                    }
                });
            }
        });

        modal.find(".hide_notifs").click(function () {
            _this.hideNotifs("modal");
        });

        modal.find(".snooze").click(function () {
            _this.snoozeNotifs("modal");
            _this.hideNotifs("modal");
        });
    }

    /**
     * Bind all events to notifications, set onCLick handlers
     * Take Notifications (array) and set banner_jq & modal_jq for later injection
     */
    buildNotifications() {
        let all_notifs = this.notif_objs;
        let html_cont = {};
        html_cont["banner"] = $(this.getBannerContainerUI());
        html_cont["modal"] = $(this.getModalContainerUI());

        this.bindBannerEvents(html_cont["banner"]);
        this.bindModalEvents(html_cont["modal"]);

        if (this.snooze_duration) {
            html_cont["modal"].find(".snooze span").text("for " + this.snooze_duration + " min.");
            html_cont["banner"].find(".snooze span").text("for " + this.snooze_duration + " min.");
        }

        for (let i in all_notifs) {
            let notif = all_notifs[i];

            if (!notif.isDismissed() && !notif.isFuture() && !notif.isExpired() && notif.displayOnPage()) {
                //force surveys to be modals no matter what
                let notif_type = notif.getType();
                let notif_cont = notif.getTarget() == "survey" ? ".notif_cont_project" : ".notif_cont_" + notif.getTarget();

                let jqunit = notif.getJQUnit();

                jqunit.find(".dismissbtn").on("click", function(){
                    notif.dismissNotif();
                });

                html_cont[notif_type].find(notif_cont).append(jqunit);
            }
        }

        for (let notif_style in html_cont) {
            if (html_cont[notif_style].find(".notif.alert").length) {
                if (notif_style == "banner") {
                    this.banner_jq = html_cont[notif_style];
                } else {
                    this.modal_jq = html_cont[notif_style];
                }
            }
        }
    }

    dismissNotif(notif_key) {
        //PHP CLASS APPEARS TO BE LOOKING FOR AN ARRAY SO WRAPPING IN []
        var _this = this;
        console.log("dismiss notif", notif_key);
        _this.parent.callAjax("save_dismissals", [notif_key], function (result) {
            var result = result.results;
        }, function (err) {
            _this.setEndpointFalse(err);
        });
    }

    snoozeNotifs(notif_type) {
        var snooze_expire = this.calcSnoozeExpiration();
        this.payload.snooze_expire[notif_type] = snooze_expire;
        localStorage.setItem(this.redcap_notif_storage_key, JSON.stringify(this.payload));
        // this.parent.Log("snoozing " + notif_type + " " +  this.payload.snooze_expire, {});
    }

    isSnoozed(notif_type) {
        var calc = Date.now() - this.payload.snooze_expire[notif_type];
        if (this.payload.snooze_expire[notif_type] && calc < 0) {
            // this.parent.Log(notif_type + " notifs should be snoozed for another " + Math.abs(calc)/60000 + " minutes", {});
            return true;
        } else {
            return false;
        }
    }

    calcSnoozeExpiration() {
        var expiration_time = Date.now() + (this.snooze_duration * 60000);
        return expiration_time;
    }
    getOffsetTime(date_str) {
        var client_offset = Date.now();
        if (date_str && this.payload.client.offset_hours) {
            var date_ts = new Date(date_str);
            var client_offset_ts = date_ts.getTime() + (parseInt(this.payload.client.offset_hours) * 60000 * 60);
            client_offset = new Date(client_offset_ts);
        }
        var date = client_offset.getFullYear() + '-' + (client_offset.getMonth() + 1) + '-' + client_offset.getDate();
        var time = client_offset.getHours() + ":" + client_offset.getMinutes() + ":" + client_offset.getSeconds();
        var offset_date_time = date + ' ' + time;

        // this.parent.Log("offset server time in client context " + offset_date_time, "info");

        return offset_date_time;
    }

    //GET
    getEndpointStatus() {
        return this.serverOK;
    }

    getCurPage() {
        return this.page;
    }

    getLastUpdate() {
        return this.payload.server.updated ?? null;
    }
    getProjectId() {
        //IF on a project page, will have projectID otherwise null
        return this.project_id;
    }
    getDevProdStatus() {
        //IF on a project page, will have devprod status of 0,1, null
        return this.dev_prod_status;
    }

    // Individual Notifications get injected within this UI code
    getModalContainerUI() {
        return (
            `<div id="redcap_modal_notifs" class="modal redcap_notifs"  style="display: block;" >
                <div class="modal-dialog" role="document" style="max-width: 950px !important;">
                    <div class="modal-content">
                        <div class="modal-header py-2">
                            <button type="button" class="py-2 close  hide_notifs" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">×</span></button>
                            <h4 id="add-edit-title-text" class="modal-title form-control-custom">REDCap Notifications</h4>
                        </div>
                        <div class="modal-body pt-2">
                            <div id="errMsgContainerModal" class="alert alert-danger col-md-12" role="alert" style="display:none;margin-bottom:20px;"></div>
                            <div class="mb-2">These notifications can be dismissed or 'snoozed'.  But should not be ignored.</div>
                            <div class="notif_cont_system">

                            </div>
                            <div class="notif_cont_project">

                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-rcred dismiss_all">Dismiss All</button>
                            <button class="btn btn-rcpurple-light snooze">Snooze All <span></span></button>
                        </div>
                    </div>
                </div>
            </div>`);
    }

    getBannerContainerUI() {
        return (
            `<div id="redcap_banner_notifs" class="redcap_notifs">
                <div class="banner-header">
                    <h4>REDCap Notifications</h4>
                    <button class="btn-s-xs btn-rcred dismiss_all">Dismiss All</button>
                    <button class="btn-s-xs btn-rcpurple-light snooze">Snooze All <span></span></button>
                </div>
                <div class="notif_cont_system"></div>
                <div class="notif_cont_project"></div>
            </div>`
        );
    }
}

