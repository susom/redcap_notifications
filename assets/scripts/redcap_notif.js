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
notif_type["growler"]     = `<div class="alert">
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
    this.dismissed      = false;
    this.future         = false;
    this.expired        = false;

    this.domjq          = null;
    this.buildNotif();
}

//build alert ui and ux
RCNotif.prototype.buildNotif = function(){
    var _this       = this;

    var notif_jq    = $(notif_type[this.getType()]);
    var notif_sufx  = $.inArray( this.getAlertStatus(), [ "info", "warning", "danger" ])  >= 0 ? this.getAlertStatus() : "secondary";
    notif_jq.addClass(this.getTarget()).addClass("alert-" + notif_sufx);

    if(this.notif.note_end_dt != ""){
        notif_jq.find(".notif_hdr").text("Expires on " + this.getEndDate());
    }
    notif_jq.find(".notif_bdy .headline").text(this.getSubject());
    notif_jq.find(".notif_bdy .lead").text(this.getMessage());

    if(this.notif.hasOwnProperty("note_dismiss") && this.isDimissable()){
        notif_jq.addClass("dismissable");
        notif_jq.find(".notif_ftr button").on("click", function(){
            _this.dismissNotif();
        });
    }

    if(this.getCustomIcon() !== ""){
        console.log("custom icon, put in notif");
    }

    this.domjq = notif_jq;
}
RCNotif.prototype.getJQUnit = function(){
    return this.domjq;
}
RCNotif.prototype.dismissNotif = function(){
    this.dismissed = true;

    var data = {
        "record_id": this.notif.record_id,
        "note_name": this.notif.note_name,
        "note_username": this.parent.user
    };

    this.parent.dismissNotif(data);

    this.domjq.fadeOut("fast", function(){
        $(this).remove();
    });
}

//valid checks
RCNotif.prototype.isDimissable = function(){
    return this.notif.note_dismiss == "yes";
}
RCNotif.prototype.isDismissed = function(){
    return this.dismissed;
}
RCNotif.prototype.isFuture = function(){
    var notif_start_str = this.notif["note_start_dt"];
    var notif_start_ts  = new Date(this.parent.getOffsetTime(notif_start_str));
    this.future         = notif_start_ts.getTime() > Date.now();
    if(this.future){
        console.log("future start date dont show yet");
    }
    return this.future;
}
RCNotif.prototype.isExpired = function(){
    var notif_end_str = this.notif["note_end_dt"];
    var notif_end_ts  = new Date(this.parent.getOffsetTime(notif_end_str));
    this.expired         = notif_end_ts.getTime() < Date.now();
    if(this.expired){
        console.log("this is expired, it should clear out next refresh , for now , do not show it");
    }
    return this.expired;
}
RCNotif.prototype.displayOnPage = function(cur_page){
    return this.notif.hasOwnProperty(["note_display___" + cur_page]) && this.notif["note_display___" + cur_page] == "1";
}

//get notif properties
RCNotif.prototype.showRaw = function(){
    return this.notif;
}
RCNotif.prototype.getType = function(){
    return this.notif.note_type;
}
RCNotif.prototype.getAlertStatus = function(){
    return this.notif.note_alert_status;
}
RCNotif.prototype.getStartDate = function(){
    return this.notif.note_start_dt;
}
RCNotif.prototype.getEndDate = function(){
    return this.notif.note_end_dt;
}
RCNotif.prototype.getProjId = function(){
    return this.notif.note_project_id;
}
RCNotif.prototype.getName = function(){
    return this.notif.note_name;
}
RCNotif.prototype.getRecordId = function(){
    return this.notif.record_id;
}
RCNotif.prototype.getSubject = function(){
    return this.notif.note_subject;
}
RCNotif.prototype.getMessage = function(){
    return this.notif.note_message;
}
RCNotif.prototype.getCustomIcon = function(){
    return this.notif.note_icon;
}
RCNotif.prototype.getTarget = function(){
    return this.notif.note_target;
}


