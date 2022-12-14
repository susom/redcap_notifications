;{
    // Define the jsmo in IIFE so we can reference object in our new function methods
    // The module_name will be hardcoded to the EM main Class Name;
    const module_name   = "RedcapNotifications";
    const module        = ExternalModules.Stanford[module_name];

    // Extend the official JSMO with new methods
    Object.assign(module, {
        InitFunction: function () {
            console.log("Init Function");

            // module.callAjax();
            // module.Log("this is jsmo log msg", { "record": 4, "foo":"bar" });
        },

        callAjax: function () {
            module.ajax('refresh', this.config).then(function (response) {
                // Process response
                console.log("refresh Ajax Result: ", response);
            }).catch(function (err) {
                // Handle error
                console.log(err);
            });
        },

        Log: function(subject, msg_o){
            module.log(subject, msg_o).then(function(logId) {
                console.log("message logged", logId, subject, msg_o);
            }).catch(function(err) {
                console.log("error logging message", err);
            });
        }
    });
}
