class Notification {
    notif;
    parent;
    dismissed = false;
    future = false;
    domjq = null;

    notif_type = {
        "banner": `<div class="notif alert ban">
                        <div class="notif_hdr"><button>Dismiss</button></div>
                        <div class="notif_bdy">
                            <h3 class="headline"></h3>
                            <div class="lead"></div>
                        </div>
                        <div class="notif_ftr"></div>
                    </div>`,
        "modal": `<div class="notif alert mod">
                        <div class="notif_hdr"><button>Dismiss</button></div>
                        <div class="notif_bdy">
                            <h3 class="headline"></h3>
                            <div class="lead"></div>
                        </div>
                        <div class="notif_ftr"></div>
                    </div>`,
        "growler": `<div class="notif alert growl">
                        <div class="notif_hdr"><button>Dismiss</button></div>
                        <div class="notif_bdy">
                            <h3 class="headline"></h3>
                            <div class="lead"></div>
                        </div>
                        <div class="notif_ftr"></div>
                    </div>`
    }

    default_icon = {
        "info": `<i class="fas fa-info-circle"></i>`,
        "warning": `<i class="fas fa-exclamation-triangle"></i>`,
        "danger": `<i class="fas fa-skull-crossbones"></i>`
    }

    constructor(notif, parent){
        this.notif = notif;
        this.parent = parent;
        this.buildUI();
    }

    buildUI(){
        let _this       = this;

        let notif_jq    = $(this.notif_type[this.getType()]);
        let notif_sufx  = $.inArray( this.getAlertStatus(), [ "info", "warning", "danger" ])  >= 0 ? this.getAlertStatus() : "secondary";
        notif_jq.addClass(this.getTarget()).addClass("alert-" + notif_sufx);

        if(this.notif.note_end_dt != ""){
            notif_jq.find(".notif_ftr").text("Expires on " + this.getEndDate());
        }
        notif_jq.find(".notif_bdy .headline").text(this.getSubject());

        if(this.getMessage()){
            notif_jq.find(".notif_bdy .lead").text(this.getMessage());
        }else{
            notif_jq.find(".notif_bdy .lead").remove();
        }


        if(this.notif.hasOwnProperty("note_dismiss") && this.isDimissable()){
            notif_jq.addClass("dismissable");
            notif_jq.find(".notif_hdr button").addClass("dismissbtn");
        }

        if(this.getCustomIcon() !== ""){
            notif_jq.find(".notif_bdy").attr("style", "background-image:url("+this.getCustomIcon()+");").addClass("has_icon");
        }else{
            switch(this.getAlertStatus()){
                case "info":
                    notif_jq.find(".notif_bdy").prepend($(this.default_icon["info"])).addClass("has_icon");
                    break;
                case "warning":
                    notif_jq.find(".notif_bdy").prepend($(this.default_icon["warning"])).addClass("has_icon");
                    break;
                case "danger":
                    notif_jq.find(".notif_bdy").prepend($(this.default_icon["danger"])).addClass("has_icon");
                    break;
            }
        }

        this.domjq = notif_jq;
    }

    getJQUnit(){
        return this.domjq
    }

    dismissNotif(){
        //CALL PARENT FUNCTION TO SEND TO SERVER
        this.parent.dismissNotif(this.notif.key);

        //UPDATE UI
        this.setDismissed();
        this.domjq.fadeOut("fast", function(){
            $(this).remove();
        });
    }

    isDimissable(){
        return this.notif.note_dismiss == "yes";
    }
    isDismissed(){
        return this.dismissed;
    }
    isFuture(){
        let notif_start_str = this.notif["note_start_dt"];
        let notif_start_ts  = new Date(this.parent.getOffsetTime(notif_start_str));
        this.future         = notif_start_ts.getTime() > Date.now();
        if(this.future){
            this.parent.console.log("notif " + this.getRecordId() + " has future start date dont show yet", "info");
        }
        return this.future;
    }
    isExpired(){
        let notif_end_str = this.notif["note_end_dt"];
        let notif_end_ts  = new Date(this.parent.getOffsetTime(notif_end_str));
        this.expired         = notif_end_ts.getTime() < Date.now();
        if(this.expired){
            this.parent.console.log("notif " + this.getRecordId() + " is expired, it should clear out next refresh , for now hide it", "info");
        }
        return this.expired;
    }

    displayOnPage(){
        // const queryString   = window.location.search;
        // const urlParams     = new URLSearchParams(queryString);
        let page_project_id = this.parent.getProjectId(); //if any

        //NEED TO CHECK CURRENT PAGE CONTEXT TO DETERMINE IF NOTIFS SHOULD DISPLAY (PROJECT, SURVEY, or SYSTEM)
        if( page_project_id && this.isProjectNotif() && !this.isExcluded() && this.isCorrectProjectStatus() ){
            //project notif, page is in project context
            if(page_project_id == this.getProjId() || this.getProjId() == ""){
                //project notif, specified project id = current projoect context
                return true;
            }
        }else if( this.isSurveyNotif() && this.parent.getCurPage() == "surveys/index.php" ){
            const global_var_pid = pid; //UGH
            if(this.getProjId() == global_var_pid){
                return true;
            }
        }else if( this.isSystemNotif() && !page_project_id){
            //TODO do we need to filter out project pages for system notifs?
            return true;
        }

        return false;
    }
    setDismissed(){
        this.dismissed = true;
    }

    //get notif properties
    showRaw(){
        return this.notif;
    }
    getType(){
        return this.notif.note_type;
    }
    getAlertStatus(){
        return this.notif.note_alert_status;
    }
    getStartDate(){
        return this.notif.note_start_dt;
    }
    getEndDate(){
        return this.notif.note_end_dt;
    }
    getProjId(){
        return this.notif.note_project_id;
    }
    getName(){
        return this.notif.note_name;
    }
    getRecordId(){
        return this.notif.record_id;
    }
    getSubject(){
        return this.notif.note_subject;
    }
    getMessage(){
        return this.notif.note_message;
    }
    getCustomIcon(){
        return this.notif.note_icon;
    }
    getTarget(){
        let note_target = [];

        if(this.notif.note_display___system == "1"){
            note_target.push("system");
        }

        if(this.notif.note_display___project == "1"){
            note_target.push("project");
        }

        if(this.notif.note_display___survey == "1"){
            note_target.push("survey");
        }

        return note_target;
    }
    isExcluded(){
        //check for project_exclusion
        let page_project_id = this.parent.getProjectId(); //if any
        let exclusion       = this.notif["project_exclusion"].replaceAll(" ", "");
        exclusion           = exclusion.replaceAll("\r\n", ",");
        exclusion           = exclusion.replaceAll("\r", ",");
        exclusion           = exclusion.replaceAll("\n", ",");
        let exclusion_arr   = exclusion.split(",");

        if(page_project_id && $.inArray(page_project_id , exclusion_arr) > -1){
            //project context and project_id is in exclusion list for this notif
            return true;
        }

        return false;
    }
    isCorrectProjectStatus(){
        //check for project_exclusion and dev prod status
        let dev_prod_status = this.parent.getDevProdStatus();
        let notif_dev_prod  = this.notif["project_status"] == "" ? null : parseInt(this.notif["project_status"]);

        if( dev_prod_status ){
            //PROD, ONLY
            if(!notif_dev_prod){
                return false;
            }
        }else{
            //DEV
            if(notif_dev_prod){
                //page context DEV, notif is for prod only
                return false;
            }
        }

        //let it pass!
        return true;
    }

    //shortCut Flags
    isProjectNotif(){
        return $.inArray( "project", this.getTarget())  >= 0;
    }
    isSystemNotif (){
        return $.inArray( "system", this.getTarget())  >= 0;
    }
    isSurveyNotif (){
        return $.inArray( "survey", this.getTarget())  >= 0;
    }
}
