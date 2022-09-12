var modal_container = `<div class="modal fade show" id="external-modules-configure-modal" name="external-modules-configure-modal" data-module="" tabindex="-1" data-toggle="modal" data-backdrop="static" data-keyboard="true" style="display: block;" aria-modal="true" role="dialog">
                            <div class="modal-dialog" role="document" style="max-width: 950px !important;">
                                <div class="modal-content">
                                    <div class="modal-header py-2">
                                        <button type="button" class="py-2 close closeCustomModal hide_notifs" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">×</span></button>
                                        <h4 id="add-edit-title-text" class="modal-title form-control-custom">REDCap Notifications</h4>
                                    </div>
                                    <div class="modal-body pt-2">
                                        <div id="errMsgContainerModal" class="alert alert-danger col-md-12" role="alert" style="display:none;margin-bottom:20px;"></div>
                                        <div class="mb-2">These notifications can be dismissed or 'snoozed'.  But should not be ignored.</div>
                                        <div class="notif_cont"></div>
                                    </div>
                                    <div class="modal-footer">
                                        <button data-toggle="modal" class="btn btn-rcgreen" id="btnModalsaveAlert" onclick="return false;">Save</button>
                                        <button class="btn btn-defaultrc" id="btnCloseCodesModal" data-dismiss="modal" onclick="return false;">Cancel</button>
                                    </div>
                                </div>
                            </div>
                       </div>`;

function RCNotifs(cur_user, refresh_endpoint, dismiss_endpoint, redcap_csrf_token) {
    this.notifs             = null;
    this.notif_html         = "";
    this.user               = cur_user;
    this.refresh_endpoint   = refresh_endpoint;
    this.dismiss_endpoint   = dismiss_endpoint;
    this.redcap_csrf_token  = redcap_csrf_token;
    this.banner_jq          = null;
    this.modal_jq           = null;
    this.notifStatus        = null;
    this.lastUpdated        = null;
    this.request_update     = null;

    //read storage value
    this.redcap_notif_storage_key = "redcapNotifications";

    //show notifs
    this.showNotifs();
}

RCNotifs.prototype.loadNotifs = function(){
    var _ajax_ep    = this.refresh_endpoint;

    var data        = {
         "last_updated" : this.last_updated
        ,"redcap_csrf_token": this.redcap_csrf_token
    };

    if(1==2){
        //TODO FIGURE OUT FLOW FOR SPECIFIC NOTIF TYPE REFRESH
        var notif_type = null;
        data["proj_or_sys"] = notif_type;
    }

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
RCNotifs.prototype.parseNotifs = function(data){
    var client_date_time    = getClientDateTime();
    var client_offset       = getDifferenceInHours( new Date(data["server_time"]) , new Date(client_date_time)) + "h";

    var notif_payload = {
        "server" : data["server_time"]
        ,"client" : {
            "client_time_downloaded": client_date_time,
            "calc_offset": client_offset,
            "dismssed_timestamp": [],
            "recorded_on_server": false,
            "request_update": false
        }
        ,"notifications" : data["notifs"]
    };
    /*
    this.notifs = {
         "server": { "server_time_generated": "2022-09-04 12:13:13" }
        ,"client": {
            "client_time_downloaded": "2022-09-04 16:13:13",
            "calc_offset": "4h",
            "dismssed_timestamp": [
                    {
                        "notification": "2",
                        "dismissed_at": "9/2/1 12:12:12"
                    }
                ],
            "recorded_on_server": false,
            "request_update": true
         }
        ,"notifications" : [
            {
                "record_id" : 2
                ,"note_project_id" : "xxx"
                ,"note_name" : "Test General Notif"
                ,"note_type" : "banner"
                ,"note_start_dt" : "2022-09-06 07:41:24"
                ,"client_start_dt" : "+ 4 huors"
                ,"expires_at" : "xxxxxxxx"
                ,"note_end_dt" : "2022-09-15 07:41:40"
                ,"note_creator" : "irvins"
                ,"note_subject" : "TEST GEN"
                ,"note_message" : "Hey stupid, this is a general notifcation and no you"
                ,"note_alert_status" : "info"
                ,"note_dismiss" : "no"
                ,"note_display___system" : 1
                ,"note_display___project" : 1
                ,"note_display___survey" : 1
                ,"note_icon" : null
            }
        ]
    }
    */

    for(var i in data["notifs"]){
        var one_notif = data["notifs"][i];
    }

    this.notifs = notif_payload;
    localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.notifs));
}

RCNotifs.prototype.getNotifs = function(){
    var _this           = this;
    var notif_payload   = null;
    if(typeof(Storage) !== "undefined" && localStorage.getItem(this.redcap_notif_storage_key)){
        //IF localstorage, AND localstorage has Notif DATA with key
        notif_payload = JSON.parse(localStorage.getItem(this.redcap_notif_storage_key));

        //TODO system settings WHEN to DO a FULL update (based on time delta? )
    }

    if(!notif_payload || (notif_payload && notif_payload.hasOwnProperty("client") && notif_payload["client"]["request_update"])){
        //IF no payload, or if there is a payload and it says to refresh
        this.loadNotifs().then(function(data) {
            // SUCCESFUL, parse Notifs and store in this.notif
            var response = decode_object(data);
            _this.parseNotifs(response);
        }).then(function(){
            //once set can continue to showNotifs
            _this.showNotifs();
        }).catch(function(err) {
            // Run this when promise was rejected via reject()
            console.log("Error loading notifs, do nothing they just wont see the notifs this time",err)
        });
    }else{
        this.notifs = notif_payload;
        return this.notifs;
    }

    // ajax: "#2 dispmeed at xx." => success: ts of notification project last updated => remove from local store?
    // if last_update_time > server_time_generated, "request update"...
}
RCNotifs.prototype.showNotifs = function(){
    var notifs = this.getNotifs();

    if(!notifs){
        //TODO GOTTA BE BETTER WAY TO DO THIS? BUT THIS WORKS!
        // console.log("no notifs yet");
        return;
    }

    //build notifs
    if(notifs["notifications"].length && (!this.banner_jq && !this.modal_jq)){
        this.buildNotifs();
    }



    if(this.banner_jq.find(".alert").length){
        if($("#subheader").length){
            $("#subheader").after(this.banner_jq);
        }
    }
    if(!($("#redcap_modal_notifs").length)){
        if(this.modal_jq.find(".alert").length){
            var opaque  = $("<div>").prop("id","redcap_notifs_blocker");
            $("body").append(opaque).append(this.modal_jq);
        }
    }else{
        this.modal_jq.find(".notif_cont").removeClass("hide");
    }

}
RCNotifs.prototype.buildNotifs = function(){
    var _this           = this;
    var notifs          = _this.getNotifs();
    var all_notifs      = notifs["notifications"];

    var html_cont       = {};
    html_cont["banner"] = $("<div>").prop("id", "redcap_banner_notifs").addClass("redcap_notifs").append($("<div>").addClass("hide_notifs")).append($("<div>").addClass("notif_cont"));
    html_cont["modal"]  = $(modal_container).prop("id", "redcap_modal_notifs").addClass("redcap_notifs");

    html_cont["modal"].find(".hide_notifs").click(function(){
        if($(this).hasClass("show")){
            $(this).removeClass("show");
            _this.showNotifs();
        }else{
            $(this).addClass("show");
            _this.hideNotifs();
        }
    });

    //TODO ORDER BY GEN then Proj , Non-Dismissable then Dismissables
    var notif_order     = ["gen", "proj"];

    for(var i in all_notifs){
        var notif = new RCNotif(all_notifs[i], _this);
        html_cont[all_notifs[i]["note_type"]].find(".notif_cont").append(notif.getJQUnit());
    }

    for(var notif_style in html_cont){
        if(html_cont[notif_style].find(".alert").length){
            if(notif_style == "banner"){
                this.banner_jq = html_cont[notif_style];
            }else{
                this.modal_jq = html_cont[notif_style];
            }
        }
    }
}
RCNotifs.prototype.hideNotifs = function(){
    //build notifs
    //TODO extract to properties

    $("#redcap_notifs_blocker").fadeOut("fast", function(){
        $(this).remove();
    });
    this.modal_jq.find(".notif_cont").addClass("hide");
}

RCNotifs.prototype.checkNotifStatus = function(){
    if (typeof(Storage) !== "undefined" && !this.notifStatus) {
        if(sessionStorage.getItem("redcapNotifsStatus")){
            this.notifStatus = JSON.parse(sessionStorage.getItem("redcapNotifsStatus"));
        }
    }

    return this.notifStatus;
}
RCNotifs.prototype.setNotifStatus = function(){
    if (typeof(Storage) !== "undefined") {
        sessionStorage.setItem("redcapNotifsStatus",JSON.stringify(this.notifStatus));
    }
}

//utility
function readCookie(cookie_name){
    var cookie_dough    = $.cookie(cookie_name);
    var cookies         = this.isJsonString(cookie_dough) ? JSON.parse(cookie_dough) : {};

    return cookies;
}
function isJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
function getClientDateTime(){
    var today = new Date();
    var date = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
    var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    var client_date_time    = date + ' ' + time;
    return client_date_time;
}
function getDifferenceInHours(date1, date2) {
    const diffInMs = date2 - date1;
    return round(diffInMs / (1000 * 60 * 60));
}
function decode_object(obj) {
    try {
        // parse text to json object
        var parsedObj = obj;
        if (typeof obj === 'string') {
            var temp = obj.replace(/&quot;/g, '"').replace(/[\n\r\t\s]+/g, ' ')
            parsedObj = JSON.parse(temp);
        }

        for (key in parsedObj) {
            if (typeof parsedObj[key] === 'object') {
                parsedObj[key] = decode_object(parsedObj[key])
            } else {
                parsedObj[key] = decode_string(parsedObj[key])
            }
        }
        return parsedObj
    } catch (error) {
        console.error(error);
        alert(error)
        // expected output: ReferenceError: nonExistentFunction is not defined
        // Note - error messages will vary depending on browser
    }

}
function decode_string(input) {
    var txt = document.createElement("textarea");
    txt.innerHTML = input;
    return txt.value;
}
