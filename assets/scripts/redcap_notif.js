//NOTIF TEMPLATES
var notif_type = {};

notif_type["banner"]    = `<div class="notif alert ban">
                                <div class="notif_hdr"></div>
                                <div class="notif_bdy">
                                    <h3 class="headline"></h3>
                                    <div class="lead"></div>
                                </div>
                                <div class="notif_ftr"><button>Dismiss</button></div>
                            </div>`;

notif_type["modal"]     = `<div class="notif alert mod">
                                <div class="notif_hdr"></div>
                                <div class="notif_bdy">
                                    <h3 class="headline"></h3>
                                    <div class="lead"></div>
                                </div>
                                <div class="notif_ftr"><button>Dismiss</button></div>
                           </div>`;

//TODO MODAL LOOKS BETTER AFTER ALL I THINK
notif_type["growler"]     = `<div class="notif alert growl">
                                <div class="notif_hdr"></div>
                                <div class="notif_bdy">
                                    <h3 class="headline"></h3>
                                    <div class="lead"></div>
                                </div>
                                <div class="notif_ftr"><button>Dismiss</button></div>
                           </div>`;

var default_icon = {}
default_icon["info"]    = `<i class="fas fa-info-circle"></i>`
default_icon["warning"] = `<i class="fas fa-exclamation-triangle"></i>`
default_icon["danger"]  = `<i class="fas fa-skull-crossbones"></i>`

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
        notif_jq.find(".notif_bdy").attr("style", "background-image:url("+this.getCustomIcon()+");").addClass("has_icon");
    }else{
        switch(this.getAlertStatus()){
            case "info":
                notif_jq.find(".notif_bdy").prepend($(default_icon["info"])).addClass("has_icon");
                break;
            case "warning":
                notif_jq.find(".notif_bdy").prepend($(default_icon["warning"])).addClass("has_icon");
                break;
            case "danger":
                notif_jq.find(".notif_bdy").prepend($(default_icon["danger"])).addClass("has_icon");
                break;
        }
    }

    this.domjq = notif_jq;
}
RCNotif.prototype.getJQUnit = function(){
    return this.domjq;
}
RCNotif.prototype.dismissNotif = function(){
    this.setDismissed();

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
RCNotif.prototype.displayOnPage = function(){
    const queryString   = window.location.search;
    const urlParams     = new URLSearchParams(queryString);

    //NEED TO CHECK CURRENT PAGE CONTEXT TO DETERMINE IF NOTIFS SHOULD DISPLAY (PROJECT, SURVEY, or SYSTEM)
    if( this.isProjectNotif() && urlParams.has('pid') && ( urlParams.get("pid") == this.getProjId() || this.getProjId() == "")  ){
        // console.log("is project notif, this is project page, pid match OR pid empty", this.getProjId());
        return true;
    }else if( this.isSurveyNotif() && this.parent.getCurPage() == "surveys/index.php" ){
        const global_var_pid = pid; //UGH
        if(this.getProjId() == global_var_pid){
            // console.log("is survey notif, this is survey page,  pid match ONLY", this.getProjId());
            return true;
        }
    }else if( this.isSystemNotif() && !urlParams.has('pid') ){
        // console.log("is a system notif, is not a project or survey page, url has no 'PID' ");
        return true;
    }

    // console.log("no notifs for this page", this.getRecordId(), this.getTarget(), this.isSurveyNotif());
    return false;
}
RCNotif.prototype.setDismissed = function(){
    this.dismissed = true;
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
    var note_target = "system";
    if(this.notif.note_display___project == "1"){
        note_target = "project";
    }else if(this.notif.note_display___survey == "1"){
        note_target = "survey";
    }

    return note_target;
}

//shortCut Flags
RCNotif.prototype.isProjectNotif = function(){
    return this.getTarget() == "project";
}
RCNotif.prototype.isSystemNotif  = function(){
    return this.getTarget() == "system";
}
RCNotif.prototype.isSurveyNotif  = function(){
    return this.getTarget() == "survey";
}
