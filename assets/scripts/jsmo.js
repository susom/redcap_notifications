;{
    // Define the jsmo in IIFE so we can reference object in our new function methods
    // The module_name will be hardcoded to the EM main Class Name;
    const module_name   = "RedcapNotifications";
    const module        = ExternalModules.Stanford[module_name];

    // Extend the official JSMO with new methods
    Object.assign(module, {
        InitFunction: function () {
            // console.log("JSMO Init Function");
            // console.log("integrating display class RCNotifs");
            module.config["parent"] = module;
            module.notifs           = new NotificationController(module.config);
            module.notifs.initialize()
        },

        callAjax: function (action, payload, success_cb, err_cb) {
            module.ajax(action, payload).then(function (response) {
                // Process response
                console.log(action + " Ajax Result: ", response);
                if (success_cb instanceof Function) {
                    success_cb(response);
                }
            }).catch(function (err) {
                // Handle error
                console.log(action + " Ajax Error: ", err);
                if (err_cb instanceof Function) {
                    err_cb(err);
                }
            });
        },

        callAjax2: function (action, payload) {
          return module.ajax(action, payload)
              .then(res => res)
              .catch(err => err)
        },

        Log: function(subject, msg_o){
            module.log(subject, msg_o).then(function(logId) {
                // console.log("message logged", logId, subject, msg_o);
            }).catch(function(err) {
                console.log("Logging message failure:", err);
            });
        }
    });
}
