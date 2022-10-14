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
function getDifferenceInHours(date_obj_1, date_obj_2) {
    const diffInMs = date_obj_2 - date_obj_1;
    return round(diffInMs / (1000 * 60 * 60));
}

function decode_object(obj) {
    try {
        // parse text to json object
        var parsedObj = obj;
        if (typeof obj === 'string') {
            var temp = obj.replace(/&quot;/g, '"').replace(/[\n\r\t\s]+/g, ' ')
            if(isJsonString(temp)){
                parsedObj = JSON.parse(temp);
            }
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
        console.log(error);
        // expected output: ReferenceError: nonExistentFunction is not defined
        // Note - error messages will vary depending on browser
    }

}
function decode_string(input) {
    var txt = document.createElement("textarea");
    txt.innerHTML = input;
    return txt.value;
}
