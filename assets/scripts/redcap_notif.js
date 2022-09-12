//NOTIF TEMPLATES
var notif_type = {};

notif_type["banner"]    = `<div class="alert">
                                <div class="notif_hdr"></div>
                                <div class="notif_bdy">
                                    <h3 class="headline"></h3>
                                    <div class="lead"></div>
                                </div>
                                <div class="notif_ftr"><button>Dismiss</button></div>
                            </div>`;

notif_type["modal"]     = `<div class="alert">
                                <div class="notif_hdr"></div>
                                <div class="notif_bdy">
                                    <h3 class="headline"></h3>
                                    <div class="lead"></div>
                                </div>
                                <div class="notif_ftr"><button>Dismiss</button></div>
                           </div>`;

function RCNotif(notif, parent) {
    this.notif          = notif;
    this.parent         = parent;

    this.domjq          = null;
    this.buildNotif();
}

RCNotif.prototype.buildNotif = function(){
    // WHAT CAN I DO WITH THESE?
    // [note_user_types] => admin
    // [note_user_types] => all
    // [note_display___system] => 1
    // [note_display___project] => 1
    // [note_display___survey] => 1

    var _this       = this;

    var notif_jq    = $(notif_type[this.notif.note_type]);
    var notif_sufx  = $.inArray( this.notif.note_alert_status, [ "info", "warning", "danger" ])  >= 0 ? this.notif.note_alert_status : "secondary";
    notif_jq.addClass(this.notif.note_type).addClass(this.notif.note_target).addClass("alert-" + notif_sufx);

    if(this.notif.note_end_dt != ""){
        notif_jq.find(".notif_hdr").text("Expires on " + this.notif.note_end_dt);
    }
    notif_jq.find(".notif_bdy .headline").text(this.notif.note_subject);
    notif_jq.find(".notif_bdy .lead").text(this.notif.note_message);

    if(this.notif.hasOwnProperty("note_dismiss") && this.notif.note_dismiss == "yes"){
        notif_jq.addClass("dismissable");
        notif_jq.find(".notif_ftr button").on("click", function(){
            _this.dismissNotif();
        });
    }

    if(this.notif.hasOwnProperty("note_icon") && this.notif.note_icon !== ""){
        console.log("custom icon, put in notif");
    }

    this.domjq = notif_jq;
}

RCNotif.prototype.getJQUnit = function(){
    return this.domjq;
}

RCNotif.prototype.dismissNotif = function(){
    var data = {
        "record_id" : this.notif.record_id,
        "note_name" : this.notif.note_name,
        "note_username" : this.parent.user

        ,"redcap_csrf_token": this.parent.redcap_csrf_token
    };

    $.ajax({
        url: this.parent.ajax_endpoint,
        method: 'POST',
        data: data,
        dataType: 'json'
    }).done(function (result) {
        if(result){
            console.log("dismissNotif Sucess", result);
        }else{
            console.log("dismissNotif fail?");
        }
    }).fail(function (e) {
        console.log("dismissNotif failed", e);
    });
}


