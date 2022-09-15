<?php
namespace Stanford\RedcapNotifications;
/** @var \Stanford\RedcapNotifications\RedcapNotifications $module */

use GuzzleHttp\Exception\ClientException;
use GuzzleHttp\Exception\GuzzleException;
use DateTime;

function isValid($date, $format = 'Y-m-d'){
    $dt = DateTime::createFromFormat($format, $date);
    return $dt && $dt->format($format) === $date;
}

try {
    $last_updated_post  = filter_var($_POST['last_updated'], FILTER_SANITIZE_STRING);
    $proj_or_sys_post   = filter_var($_POST['proj_or_sys'], FILTER_SANITIZE_STRING);
    $last_updated       = isValid($last_updated_post, 'Y-m-d H:i:s') ? $last_updated_post : null;
    $project_or_system  = $proj_or_sys_post ?? null;

    $all_notifications  = $module->refreshNotifications($module->getUser()->getUsername(), $last_updated, $project_or_system);
    $result             = json_encode($all_notifications, JSON_THROW_ON_ERROR);
    echo htmlentities($result, ENT_QUOTES);
} catch (\Exception $e) {
    //Entities::createException($e->getMessage());
    header("Content-type: application/json");
    http_response_code(404);
    $result = json_encode(array('status' => 'error', 'message' => $e->getMessage()), JSON_THROW_ON_ERROR);
    echo htmlentities($result, ENT_QUOTES);;
}
