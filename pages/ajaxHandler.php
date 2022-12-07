<?php
namespace Stanford\RedcapNotifications;
/** @var \Stanford\RedcapNotifications\RedcapNotifications $module */

use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\GuzzleException;
use REDCap;
use DateTime;

//if (!defined("USERID")) {
//    $module->emDebug('USer NOT signed in yet, so dont bother.  maybe they bookmarked a project page, either way catch them on next page load');
//    return;
//}

$module->emDebug("ajax Handler", $_POST);

$module->emDebugForCustomUseridList("this", "is", "not", array("working", "for", "this", "user"));

function isValid($date, $format = 'Y-m-d'){
    $dt = DateTime::createFromFormat($format, $date);
    return $dt && $dt->format($format) === $date;
}

$action = !empty($_POST['action']) ? filter_var($_POST['action'], FILTER_SANITIZE_STRING) : null;

switch($action){

    case "refresh":
        try {
            $last_updated_post  = filter_var($_POST['last_updated'], FILTER_SANITIZE_STRING);
            $proj_or_sys_post   = filter_var($_POST['proj_or_sys'], FILTER_SANITIZE_STRING);
            $last_updated       = isValid($last_updated_post, 'Y-m-d H:i:s') ? $last_updated_post : null;
            $project_or_system  = $proj_or_sys_post ?? null;
            $project_id         = filter_var($_POST['project_id'], FILTER_SANITIZE_NUMBER_INT);
            $project_id         = $project_id ?? null;

            $all_notifications  = $module->refreshNotifications($module->getUser()->getUsername(), $project_id,  $last_updated, $project_or_system);
            $result             = json_encode($all_notifications, JSON_THROW_ON_ERROR);
            $module->emDebug($last_updated_post, $proj_or_sys_post,$result);
            echo htmlentities($result, ENT_QUOTES);
        } catch (\Exception $e) {
            //Entities::createException($e->getMessage());
            header("Content-type: application/json");
            http_response_code(404);
            $result = json_encode(array('status' => 'error', 'message' => $e->getMessage()), JSON_THROW_ON_ERROR);
            echo htmlentities($result, ENT_QUOTES);;
        }

        break;

    case "dismiss":
        /**
         * This is the callback page from js when notifications are dismissed.  This page will accept the dismissed
         * notification and store it in the REDCap project which holds dismissed notifications.
         */

        $dismiss_notifs = filter_var_array($_POST['dismiss_notifs'], FILTER_SANITIZE_STRING);

        $new_timestamp  = new DateTime();
        $now            = $new_timestamp->format('Y-m-d H:i:s');

        $dismissalPid   = $module->getSystemProjectIDs('dismissal-pid');

        if(count($dismiss_notifs)){
            $data       = array();
            $return_ids = array();
            foreach($dismiss_notifs as $notif){
                $newRecordId = REDCap::reserveNewRecordId($dismissalPid);
                $data[] = array(
                    "record_id"                 => $newRecordId,
                    "note_record_id"            => $notif["record_id"],
                    "note_name"                 => $notif['note_name'],
                    "note_username"             => $notif['note_username'],
                    "note_dismissal_datetime"   => $now
                );
                $return_ids[] = $notif["record_id"];
            }

            $results = REDCap::saveData($dismissalPid, 'json', json_encode($data));
            $module->emDebug("need to return the dismissed record_ids", $return_ids);
            $module->emDebug("Save Return results: " . json_encode($results) . " for notification: " . json_encode($dismissData));

            if (empty($results['errors'])) {
                echo json_encode($return_ids);
            }
        }else{
            $module->emError("Cannot save dismissed notification because record set was empty or there was invalid data");
            echo 0;
        }

        break;

    case "force_refresh":
        //THEN we poll every 30 seconds? check the flag against and notif against current payload notifs?
        //then force a refresh if the one in EM is > than the update stamp in the payload?

        try {
            $force_refresh_arr = $module->getForceRefreshSetting();
            echo htmlentities(json_encode($force_refresh_arr), ENT_QUOTES);
        } catch (\Exception $e) {
            header("Content-type: application/json");
            http_response_code(404);
            $result = json_encode(array('status' => 'error', 'message' => $e->getMessage()), JSON_THROW_ON_ERROR);
            echo htmlentities($result, ENT_QUOTES);;
        }
        break;


    case "save_logging":
        $logs = filter_var_array($_POST['logs'], FILTER_SANITIZE_STRING);
        $module->emDebug($logs);

        $result = json_encode(array('status' => 'success', 'message' => "logs saved"), JSON_THROW_ON_ERROR);
        echo htmlentities($result, ENT_QUOTES);;
        break;

    default:
        $module->emError("Invalid Action");
        break;
}



