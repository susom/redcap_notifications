var modal_container     = `<div id="redcap_modal_notifs" class="modal redcap_notifs"  style="display: block;" >
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
                       </div>`;
var banner_container    = `<div id="redcap_banner_notifs" class="redcap_notifs">
                            <div class="banner-header">
                                <h4>REDCap Notifications</h4>
                                <button class="btn-s-xs btn-rcred dismiss_all">Dismiss All</button>
                                <button class="btn-s-xs btn-rcpurple-light snooze">Snooze All <span></span></button>
                            </div>
                            <div class="notif_cont_system">

                            </div>
                            <div class="notif_cont_project">

                            </div>
                        </div>`;

function RCNotifs(config) {
    //init config
    this.ajax_endpoint              = config.ajax_endpoint;
    this.redcap_csrf_token          = config.redcap_csrf_token;
    this.default_polling_int        = 30000; //30 seconds

    //read storage value
    this.redcap_notif_storage_key   = "redcapNotifications";
    this.user                       = config.current_user;
    this.redcap_notif_storage_key   += "_" + this.user;

    this.snooze_duration            = config.snooze_duration;
    this.refresh_limit              = config.refresh_limit;
    this.page                       = config.current_page;
    this.project_id                 = config.project_id;
    this.dev_prod_status            = config.dev_prod_status;

    //TODO temporary till we figure out the incognito sruvey ajax
    this.survey_payload             = config.survey_notif_payload;

    this.force_refresh              = null;
    this.console                    = console;//new Logging({"debug" : true, "error" : true});

    this.console.log("current page is : " + this.page, "debug");

    //default empty "payload"
    this.payload = {
         "server"   : {"updated" : null }
        ,"client"   : {
             "downloaded" : null
            ,"offset_hours" : null
            ,"dismissed" : []
            ,"request_update" : null
         }
        ,"notifs" : []
        ,"snooze_expire" : {"banner" : null, "modal" :null }
    };

    //DOM and Notif Obj Cache
    this.banner_jq          = null;
    this.modal_jq           = null;
    this.notif_objs         = [];


    //load and parse notifs
    this.loadNotifs();

    //KICK OFF POLL TO SHOW NOTIFS (IF NOT SNOOZED)
    if(this.payload.server.updated){
        //first time just call it , then interval 30 seconds there after
        this.getForceRefresh();
        this.showNotifs();
    }
    if(this.payload.client.dismissed.length){
        //first time just call it , then interval 30 seconds there after
        this.dismissNotifs();
    }

    this.startPolling();
}

//notification payload
RCNotifs.prototype.refreshFromServer = function(notif_type){
    var _ajax_ep    = this.ajax_endpoint;

    //
    var data        = {
         "action"           : "refresh"
        ,"last_updated"     : this.force_refresh ? null : this.getLastUpdate()
        ,"redcap_csrf_token": this.redcap_csrf_token
        ,"proj_or_sys"      : notif_type ?? "both"
    };

    return new Promise(function(resolve, reject) {
        $.ajax({
            url: _ajax_ep,
            method: 'POST',
            data: data,
            success: function(result) {
                resolve(result) // Resolve promise and go to then()
            },
            error: function(err) {
                reject(err) // Reject the promise and go to catch()
            }
        });
    });
}
RCNotifs.prototype.loadNotifs = function(){
    if(localStorage.getItem(this.redcap_notif_storage_key)){
        //IF localstorage, AND localstorage has Notif DATA with key
        this.payload = JSON.parse(localStorage.getItem(this.redcap_notif_storage_key));
    }

    if( this.isStale() ){
        var _this = this;
        this.refreshFromServer().then(function(data) {
            // SUCCESFUL, parse Notifs and store in this.notif
            var response = decode_object(data);
            if(response){
                _this.parseNotifs(response);
            }
        }).catch(function(err) {
            // Run this when promise was rejected via reject()
            _this.console.log("Error loading or parsing notifs, do nothing they just wont see the notifs this time",  "error");
        });
    }else{
        this.buildNotifUnits();
    }

    return;
}
RCNotifs.prototype.parseNotifs = function(data){
    var client_date_time    = getClientDateTime();
    var client_offset       = getDifferenceInHours( new Date(data["server_time"]) , new Date(client_date_time)) + "h";

    //TODO TEMPORARY UNTIL FIGURE OUT AJAX
    if(this.survey_payload){
        data = JSON.parse(this.survey_payload);
    }

    this.payload = {
        "server"   : {"updated" : data["server_time"] }
        ,"client"   : {
            "downloaded" : client_date_time
            ,"offset_hours" : client_offset
            ,"dismissed" : []
            ,"request_update" : null
        }
        ,"notifs" : data["notifs"]
        ,"snooze_expire" : {"banner" : null, "modal" :null }
    };
    this.console.log("fresh load from server" + JSON.stringify(this.payload), "info");

    //fresh payload, need to clear out notifs cache.
    this.notif_objs = [];
    this.buildNotifUnits();

    //TODO TEMPORARY UNTIL FIGURE OUT AJAX
    if(!this.survey_payload){
        localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
    }

    if(this.force_refresh){
        //TODO DOES IT MAKE SENSE TO LOAD JUST NEW STUFF SINCE THE LAST UPDATE AND CONCATING , OR JUST PULL ENTIRELY NEW FRESH BATCH?
        this.force_refresh = false;
    }

    //i just do this?
    this.showNotifs();
}
RCNotifs.prototype.isStale = function(){
    if(this.force_refresh){
        return true;
    }

    var hours_since_last_updated = "N/A";
    if(this.payload.server.updated){
        hours_since_last_updated = getDifferenceInHours(new Date(this.getOffsetTime(this.payload.server.updated)) , Date.now()) ;
        if(hours_since_last_updated < this.refresh_limit){
            return false;
        }
    }
    this.console.log("notif payload isStale() " + hours_since_last_updated +  " hours since last updated", "info");
    return true;
}
RCNotifs.prototype.getForceRefresh = function(){
    var _this   = this;
    var data    = {
        "action" : "force_refresh",
        "redcap_csrf_token" : _this.redcap_csrf_token
    }

    $.ajax({
        url: _this.ajax_endpoint,
        method: 'POST',
        data: data
    }).done(function (result) {
        if(result){
            var forced_refresh_list = decode_object(result);
            var force_record_ids    = Object.keys(forced_refresh_list);

            for(var i in _this.notif_objs){
                var notif_o = _this.notif_objs[i];
                if ($.inArray(notif_o.getRecordId(), force_record_ids) > -1){
                    var check_force = new Date(_this.getLastUpdate()) < new Date(forced_refresh_list[notif_o.getRecordId()]);
                    if(check_force){
                        console.log("forced refresh");

                        //one match is enough to refresh entire payload
                        _this.force_refresh = true;
                        _this.console.log("Notif " + notif_o.getRecordId() + " needs force refresh at " + forced_refresh_list[notif_o.getRecordId()] , "info" );
                        break;
                    }
                }
            }
        }
    }).fail(function (e) {
        _this.console.log("getForceRefresh failed" + JSON.stringify(e), "error");
    });
}

//polling during page session
RCNotifs.prototype.startPolling = function(){
    this.pollNotifsDisplay();
    this.pollDismissNotifs();
    this.pollForceRefresh();
    this.pollPushLogs();
}
RCNotifs.prototype.pollDismissNotifs = function(){
    var _this = this;
    setInterval(function() {
        _this.dismissNotifs()
    }, this.default_polling_int);
}
RCNotifs.prototype.pollNotifsDisplay = function(){
    var _this = this;
    setInterval(function() {
        if(_this.isStale()) {
            _this.loadNotifs();
        }else if(_this.payload.server.updated){
            _this.showNotifs();
        }else{
            _this.console.log("no payload to display yet", "misc");
        }
    }, this.default_polling_int);
}
RCNotifs.prototype.pollForceRefresh = function(){
    var _this = this;
    setInterval(function() {
        var payload_last_update = _this.getLastUpdate();

        if(payload_last_update){
            _this.getForceRefresh();
        }
    }, this.default_polling_int);
}
RCNotifs.prototype.pollPushLogs = function(){
    var _this = this;
    setInterval(function() {
        _this.pushLogs();
    }, this.default_polling_int);
}

//UI display and behavior
RCNotifs.prototype.showNotifs = function(){
    //Check against the snoozed notifs
    //Also check against FUTURE start time stamps
    if(!this.notif_objs.length){
        return;
    }

    this.hideNotifs("banner");
    this.hideNotifs("modal");

    //rebuild everytime?
    this.buildNotifs();

    if(!this.isSnoozed("banner") && this.banner_jq && this.banner_jq.find(".notif.alert").length){
        if(!$("#redcap_banner_notifs").length && ($("#subheader").length || $("#container").length)){
            if(this.getCurPage() == "surveys/index.php"){
                $("#container").prepend(this.banner_jq);
            }else{
                $("#subheader").after(this.banner_jq);
            }
        }
    }

    if(!this.isSnoozed("modal") && this.modal_jq && this.modal_jq.find(".notif.alert").length){
        var opaque  = $("<div>").prop("id","redcap_notifs_blocker");
        if(!$("#redcap_notifs_blocker").length){
            $("body").append(opaque);
            if(this.getCurPage() == "surveys/index.php"){
                $("#container").append(this.modal_jq);
            }else{
                $("body").append(this.modal_jq);
            }
        }
    }
}
RCNotifs.prototype.hideNotifs = function(notif_type){
    var _this = this;

    if(notif_type == "banner"){
        if(this.banner_jq){
            this.banner_jq.addClass("hide");
            this.banner_jq.remove();
        }
        this.banner_jq = null;
    }

    if(notif_type == "modal"){
        if(this.modal_jq){
            this.modal_jq.addClass("hide");
            this.modal_jq.remove();
        }
        _this.modal_jq = null;
        $("#redcap_notifs_blocker").remove();

    }
}
RCNotifs.prototype.buildNotifs = function(){
    var _this           = this;
    var all_notifs      = this.notif_objs;

    var html_cont       = {};
    html_cont["banner"] = $(banner_container);
    html_cont["modal"]  = $(modal_container);

    //Batch hide notifs containers FOR "snooze" or "one off hide"
    html_cont["banner"].find(".dismiss_all").click(function(){
        // _this.console.log("dismmiss all dismissable banners", "debug");
        if(html_cont["banner"].find(".dismissable").length){
            // _this.console.log("how many banner notifs to dimsmiss " + html_cont["banner"].find(".dismissable .notif_hdr button").length, "debug");

            html_cont["banner"].find(".dismissable .notif_hdr button").each(function(){
                if($(this).is(":visible")){
                    $(this).trigger("click");
                }
            });
        }
    });
    html_cont["banner"].find(".hide_notifs").click(function(){
        _this.hideNotifs("banner");
    });
    html_cont["banner"].find(".snooze").click(function(){
        _this.snoozeNotifs("banner");
        _this.hideNotifs("banner");
    });

    html_cont["modal"].find(".dismiss_all").click(function(){
        // _this.console.log("dismmiss all dismissable modal", "debug");
        if(html_cont["modal"].find(".dismissable").length){
            // _this.console.log("how many modal notifs to dismiss? " + html_cont["modal"].find(".dismissable .notif_hdr button").length, "debug");

            html_cont["modal"].find(".dismissable .notif_hdr button").each(function(){
                if($(this).is(":visible")){
                    $(this).trigger("click");
                }
            });
        }
    });
    html_cont["modal"].find(".hide_notifs").click(function(){
        _this.hideNotifs("modal");
    });
    html_cont["modal"].find(".snooze").click(function(){
        _this.snoozeNotifs("modal");
        _this.hideNotifs("modal");
    });

    if(this.snooze_duration){
        html_cont["modal"].find(".snooze span").text("for " + this.snooze_duration + " min.");
        html_cont["banner"].find(".snooze span").text("for " + this.snooze_duration + " min.");
    }

    for(var i in all_notifs){
        var notif = all_notifs[i];

        if(!notif.isDismissed() && !notif.isFuture() && !notif.isExpired() && notif.displayOnPage()){
            //force surveys to be modals no matter what
            var notif_type = notif.getType();
            var notif_cont = notif.getTarget() == "survey" ? ".notif_cont_project" : ".notif_cont_"+notif.getTarget();

            html_cont[notif_type].find(notif_cont).append(notif.getJQUnit());
        }
    }

    for(var notif_style in html_cont){
        if(html_cont[notif_style].find(".notif.alert").length){
            if(notif_style == "banner"){
                this.banner_jq  = html_cont[notif_style];
            }else{
                this.modal_jq   = html_cont[notif_style];
            }
        }
    }
}
RCNotifs.prototype.dismissNotif = function(data){
    this.payload.client.dismissed.push(data);
    localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
}
RCNotifs.prototype.dismissNotifs = function(){
    if(this.payload.client.dismissed.length){
        this.console.log("polling dismiss " +  this.payload.client.dismissed.length + " items",  " info");

        var _this = this;
        var data = {
            "action" : "dismiss",
            "dismiss_notifs" : this.payload.client.dismissed,
            "redcap_csrf_token" : this.redcap_csrf_token
        }

        return;
        $.ajax({
            url: this.ajax_endpoint,
            method: 'POST',
            data: data,
            dataType : 'JSON'
        }).done(function (result) {
            if(result){
                _this.console.log("dismissNotif Sucess", "misc");
                _this.resolveDismissed(result);
            }
        }).fail(function (e) {
            _this.console.log("dismissNotif failed " +  JSON.stringify(e), "error");
        });
    }else{
        // this.console.log("no notifs to dismiss yet", "misc");
    }
}
RCNotifs.prototype.resolveDismissed = function(remove_notifs){
    var i = this.payload.client.dismissed.length
    while (i--) {
        if ($.inArray(this.payload.client.dismissed[i]["record_id"], remove_notifs) > -1) {
            this.payload.client.dismissed.splice(i, 1);
            localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
        }
    }

    var i = this.payload.notifs.length
    while (i--) {
        if ($.inArray(this.payload.notifs[i]["record_id"], remove_notifs) > -1) {
            this.payload.notifs.splice(i, 1);
            localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
        }
    }
}
RCNotifs.prototype.buildNotifUnits = function(){
    if(this.payload.notifs.length){
        var dismissed_ids = [];

        for(var i in this.payload.client.dismissed){
            dismissed_ids.push(this.payload.client.dismissed[i]["record_id"]);
        }

        for(var i in this.payload.notifs){
            var notif = new RCNotif(this.payload.notifs[i], this);

            //if in dimissed queue dont show
            if($.inArray(notif.getRecordId(), dismissed_ids)> -1){
                notif.setDismissed();
            }

            this.notif_objs.push(notif);
        }
    }
}


//Snoozing utils
RCNotifs.prototype.snoozeNotifs = function(notif_type){
    var snooze_expire = this.calcSnoozeExpiration();
    this.payload.snooze_expire[notif_type] = snooze_expire;
    localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
    this.console.log("snoozing " + notif_type + " " +  this.payload.snooze_expire, "info");
}
RCNotifs.prototype.isSnoozed = function(notif_type){
    var calc = Date.now() - this.payload.snooze_expire[notif_type];
    if(this.payload.snooze_expire[notif_type] && calc < 0){
        this.console.log(notif_type + " notifs should be snoozed for another " + Math.abs(calc)/60000 + " minutes", "info");
        return true;
    }else{
        return false;
    }
}
RCNotifs.prototype.calcSnoozeExpiration = function(){
    var expiration_time = Date.now() + (this.snooze_duration*60000);
    return expiration_time;
}
RCNotifs.prototype.getOffsetTime = function(date_str){
    var client_offset = Date.now();
    if(date_str && this.payload.client.offset_hours){
        var date_ts             = new Date(date_str);
        var client_offset_ts    = date_ts.getTime() + (parseInt(this.payload.client.offset_hours) * 60000 * 60);
        client_offset           = new Date(client_offset_ts);
    }
    var date = client_offset.getFullYear() + '-' + (client_offset.getMonth()+1) + '-' + client_offset.getDate();
    var time = client_offset.getHours() + ":" + client_offset.getMinutes() + ":" + client_offset.getSeconds();
    var offset_date_time = date + ' ' + time;

    // this.console.log("offset server time in client context " + offset_date_time, "info");

    return offset_date_time;
}

//GET
RCNotifs.prototype.getCurPage = function(){
    return this.page;
}
RCNotifs.prototype.getLastUpdate = function(){
    return this.payload.server.updated ?? null;
}
RCNotifs.prototype.getProjectId = function(){
    //IF on a project page, will have projectID otherwise null
    return this.project_id;
}
RCNotifs.prototype.getDevProdStatus = function(){
    //IF on a project page, will have devprod status of 0,1, null
    return this.dev_prod_status;
}
//LOGGING
RCNotifs.prototype.pushLogs = function(){
    var _this       = this;

    //TODO LATER ON TURN THIS BACK ON
    return;
    var all_logs    = {"hi":"bye"};//_this.console.getAllLogs();

    console.log("all logs", all_logs);

    var data    = {
        "action" : "save_logging",
        "redcap_csrf_token" : _this.redcap_csrf_token,
        "logs" : all_logs
    }

    $.ajax({
        url: _this.ajax_endpoint,
        method: 'POST',
        data: data
    }).done(function (result) {
        if(result){
            console.log(decode_object(result));
        }
    }).fail(function (e) {
        console.log("pushLogs failed" + JSON.stringify(e), "error");
    });
}




