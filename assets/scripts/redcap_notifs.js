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
                                        <div class="notif_cont_gen">

                                        </div>
                                        <div class="notif_cont_proj">

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
                            <div class="notif_cont_gen">

                            </div>
                            <div class="notif_cont_proj">

                            </div>
                        </div>`;

function RCNotifs(config) {
    //read storage value
    this.redcap_notif_storage_key   = "redcapNotifications";
    this.user                       = config.current_user;
    this.refresh_endpoint           = config.refresh_notifs_endpoint;
    this.dismiss_endpoint           = config.dismiss_notifs_endpoint;
    this.redcap_csrf_token          = config.redcap_csrf_token;
    this.snooze_duration            = config.snooze_duration;
    this.force_refresh              = config.force_refresh;
    this.page                       = config.current_page;

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

    this.banner_jq          = null;
    this.modal_jq           = null;

    //load and parse notifs
    this.loadNotifs();

    //KICK OFF POLL TO SHOW NOTIFS (IF NOT SNOOZED)
    if(this.payload.client.dismissed.length){
        //first time just call it , then interval 30 seconds there after
        this.dismissNotifs();
    }
    if(this.payload.server.updated){
        //first time just call it , then interval 30 seconds there after
        this.showNotifs();
    }

    this.pollNotifsDisplay();
    this.pollDismissNotifs();
}

//notification payload
RCNotifs.prototype.refreshFromServer = function(notif_type){
    var _ajax_ep    = this.refresh_endpoint;
    var data        = {
         "last_updated"     : this.server_time
        ,"redcap_csrf_token": this.redcap_csrf_token
        ,"proj_or_sys" : notif_type ?? null
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
        //TODO system settings WHEN to DO a FULL update (based on time delta? )
        var _this = this;
        this.refreshFromServer().then(function(data) {
            // SUCCESFUL, parse Notifs and store in this.notif
            var response = decode_object(data);
            _this.parseNotifs(response);
        }).catch(function(err) {
            // Run this when promise was rejected via reject()
            console.log("Error loading notifs, do nothing they just wont see the notifs this time",err)
        });
    }

    return;
}
RCNotifs.prototype.parseNotifs = function(data){
    var client_date_time    = getClientDateTime();
    var client_offset       = getDifferenceInHours( new Date(data["server_time"]) , new Date(client_date_time)) + "h";

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
    console.log("fresh load from server", this.payload);
    localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
}
RCNotifs.prototype.isStale = function(){
    if(this.payload.server.updated){
        var hours_since_last_updated = getDifferenceInHours(new Date(this.getOffsetTime(this.payload.server.updated)) , Date.now()) ;
        if(hours_since_last_updated < this.force_refresh){
            return false;
        }
    }
    console.log("isStale() " + hours_since_last_updated +  " hours since last updated" );
    return true;
}

//polling during page session
RCNotifs.prototype.pollDismissNotifs = function(){
    var _this = this;
    setInterval(function() {
        _this.dismissNotifs()
    }, 30000); // 60 * 1000 milsec
}
RCNotifs.prototype.pollNotifsDisplay = function(){
    var _this = this;
    setInterval(function() {
        if(_this.isStale()) {
            _this.loadNotifs();
        }else if(_this.payload.server.updated){
            _this.showNotifs();
        }else{
            console.log("no payload to display yet");
        }
    }, 30000); // 60 * 1000 milsec
}

//UI display and behavior
RCNotifs.prototype.showNotifs = function(){
    //Check against the snoozed notifs
    //Also check against FUTURE start time stamps
    var notifs = this.payload.notifs;

    if(!notifs.length){
        return;
    }

    //build notifs
    if((!this.banner_jq || !this.modal_jq)){
        this.buildNotifs();
    }

    // LY - adding check for this.banner_jq is not null otherwise .length bombs
    if(!this.isSnoozed("banner") && this.banner_jq && this.banner_jq.find(".alert").length){
        if(!$("#redcap_banner_notifs").length && $("#subheader").length){
            $("#subheader").after(this.banner_jq);
        }
    }

    if(!this.isSnoozed("modal") && this.modal_jq.find(".alert").length){
        var opaque  = $("<div>").prop("id","redcap_notifs_blocker");

        if(!$("#redcap_notifs_blocker").length){
            $("body").append(opaque).append(this.modal_jq);;
        }
    }
}
RCNotifs.prototype.hideNotifs = function(notif_type){
    var _this = this;
    if(notif_type == "modal"){
        $("#redcap_notifs_blocker").fadeOut("fast", function(){
            $(this).remove();
            _this.modal_jq.addClass("hide");
            _this.modal_jq.remove();
            _this.modal_jq = null;
        });
    }

    if(notif_type == "banner"){
        this.banner_jq.addClass("hide");
        this.banner_jq.remove();
        this.banner_jq = null;
    }
}
RCNotifs.prototype.buildNotifs = function(){
    var _this           = this;
    var all_notifs      = this.payload.notifs;

    var html_cont       = {};
    html_cont["banner"] = $(banner_container);
    html_cont["modal"]  = $(modal_container);

    //Batch hide notifs containers FOR "snooze" or "one off hide"
    html_cont["banner"].find(".dismiss_all").click(function(){
        if(html_cont["banner"].find(".dismissable").length){
            html_cont["banner"].find(".dismissable .notif_ftr button").each(function(){
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
        if(html_cont["modal"].find(".dismissable").length){
            html_cont["modal"].find(".dismissable .notif_ftr button").each(function(){
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
        var notif = new RCNotif(all_notifs[i], _this);
        if(!notif.isDismissed() && !notif.isFuture() && !notif.isExpired()){
            html_cont[notif.getType()].find(".notif_cont_"+notif.getTarget()).append(notif.getJQUnit());
        }
    }

    for(var notif_style in html_cont){
        if(html_cont[notif_style].find(".alert").length){
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
        var _this = this;
        var data = {
            "dismiss_notifs" : this.payload.client.dismissed,
            "redcap_csrf_token" : this.redcap_csrf_token
        }
        $.ajax({
            url: this.dismiss_endpoint,
            method: 'POST',
            data: data,
            dataType : 'JSON'
        }).done(function (result) {
            if(result){
                console.log("dismissNotif Sucess");
                _this.resolveDismissed(result);
            }
        }).fail(function (e) {
            console.log("dismissNotif failed", e);
        });
    }else{
        console.log("no notifs to dismiss yet");
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

//Snoozing utils
RCNotifs.prototype.snoozeNotifs = function(notif_type){
    var snooze_expire = this.calcSnoozeExpiration();
    this.payload.snooze_expire[notif_type] = snooze_expire;
    localStorage.setItem(this.redcap_notif_storage_key,JSON.stringify(this.payload));
    console.log("snoozing", notif_type,  this.payload.snooze_expire);
}
RCNotifs.prototype.isSnoozed = function(notif_type){
    var calc = Date.now() - this.payload.snooze_expire[notif_type];
    if(this.payload.snooze_expire[notif_type] && calc < 0){
        console.log(notif_type + " notifs should be snoozed for another " , Math.abs(calc)/60000 , "minutes");
        return true;
    }else{
        // console.log(notif_type, this.payload.snooze_expire[notif_type], calc, "expire is past or it is null") ;
        return false;
    }
}
RCNotifs.prototype.calcSnoozeExpiration = function(){
    var expiration_time = Date.now() + (this.snooze_duration*60000);
    console.log("expiration time", Date.now(), expiration_time);
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

    // console.log("offset server time in client context", server_date_time);

    return offset_date_time;
}

//misc utility
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


