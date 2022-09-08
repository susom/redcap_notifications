function RCNotifs(cur_user, ajax_endpoint) {
    this.notifs         = {};
    this.notif_html     = "";
    this.user           = cur_user;
    this.ajax_endpoint  = ajax_endpoint;

    //read cookie
    var redcap_notif_cookie = "redcapNotifications";
    this.cookies = this.readCookie(redcap_notif_cookie);

    //parse notifs
    this.parseNotifs();

    //show notifs
    this.showNotifs();
}

RCNotifs.prototype.getNotifs = function(){
    //TODO encapsulate the readCookie and parsetNotifs into here?
    var notifs = this.notifs;

    return notifs;
}
RCNotifs.prototype.parseNotifs = function(){
    var systems  = this.cookies["system"] ?? [];
    var projects = this.cookies["project"] ?? [];

    this.notifs["system"]   = systems;
    this.notifs["project"]  = projects;

    // console.log("PARSE NOTIFS", this.notifs);
}

RCNotifs.prototype.showNotifs = function(){
    //build notifs
    this.buildNotifs();
}
RCNotifs.prototype.hideNotifs = function(){
    //build notifs
    //TODO extract to properties
    $("#redcap_banner_notifs, #redcap_modal_notifs").fadeOut("fast",function(){
       $(this).remove();
    });
}

RCNotifs.prototype.buildNotifs = function(){
    var _this           = this;
    var notifs          = _this.getNotifs();
    var all_notifs      = $.merge(notifs["system"],notifs["project"]);

    var html_cont       = {};
    html_cont["banner"] = $("<div>").prop("id", "redcap_banner_notifs").addClass("redcap_notifs").append($("<div>").addClass("hide_notifs")).append($("<div>").addClass("notif_cont"));
    html_cont["modal"]  = $("<div>").prop("id", "redcap_modal_notifs").addClass("redcap_notifs").append($("<div>").addClass("hide_notifs")).append($("<div>").addClass("notif_cont"));

    html_cont["modal"].find(".hide_notifs").click(function(){
        if($(this).hasClass("show")){
            $(this).removeClass("show");
            // _this.showNotifs();
        }else{
            $(this).addClass("show");
            // _this.hideNotifs();
        }
    });

    //TODO ORDER BY GEN then Proj , Non-Dismissable then Dismissables
    var notif_order     = ["gen", "proj"];

    for(var i in all_notifs){
        var notif = new RCNotif(all_notifs[i], _this);
        console.log(all_notifs[i]["note_type"],notif.getJQUnit());
        html_cont[all_notifs[i]["note_type"]].find(".notif_cont").append(notif.getJQUnit());
    }

    for(var notif_style in html_cont){

        if(html_cont[notif_style].find(".alert").length){
            if(notif_style == "banner"){
                if($("#subheader").length){
                    $("#subheader").after(html_cont[notif_style]);
                }
            }else{
                var opaque  = $("<div>").prop("id","redcap_notifs_blocker");
                $("body").append(opaque).append(html_cont[notif_style]);
            }
        }
    }
}

//utility
RCNotifs.prototype.readCookie = function(cookie_name){
    var cookie_dough    = $.cookie(cookie_name);
    var cookies         = this.isJsonString(cookie_dough) ? JSON.parse(cookie_dough) : {};

    return cookies;
}
RCNotifs.prototype.isJsonString = function(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
