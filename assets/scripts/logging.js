
function Logging(config) {
    this.logs = {
         "debug" : []
        ,"error" : []
        ,"info"  : []
        ,"misc"  : []
    }

    this.debug = config.debug ?? null;
    this.error = config.error ?? null;
    this.info  = config.info ?? null;
    this.misc  = config.misc ?? null;
}

Logging.prototype.log = function(msg, category){
    var ts          = getClientDateTime();
    category        = category ?? "misc";
    this[category]  = {"timestamp" : ts, "message" : msg};

    if(
           (category == "debug" && this.debug)
        || (category == "error" && this.error)
        || (category == "info" && this.info)
        || (category == "misc" && this.misc)
    ) {
        console.log(ts, category, msg);
    }
}

Logging.prototype.getAllLogs = function(){
    return this.logs;
}




