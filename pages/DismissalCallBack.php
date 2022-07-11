<?php
namespace Stanford\RedcapNotifications;
/** @var \Stanford\RedcapNotifications\RedcapNotifications $module */

/**
 * This is the callback page from js when notifications are dismissed.  This page will accept the dismissed
 * notification and store it in the REDCap project which holds dismissed notifications.
 */

use REDCap;
use DateTime;

if (empty(filter_var($_POST['record_id'], FILTER_SANITIZE_STRING))) {
    $module->emError("Cannot save dismissed notification because the notification record id is empty");
    return;
} else if (empty(filter_var($_POST['note_name'], FILTER_SANITIZE_STRING))) {
    $module->emError("Cannot save dismissed notification because the notification name is empty");
    return;
} else if (empty(filter_var($_POST['note_username'], FILTER_SANITIZE_STRING))) {
    $module->emError("Cannot save dismissed notification because the username is empty");
    return;
}

// Get current timestamp so we can put the timestamp when the notification was dismissed
$new_timestamp = new DateTime();
$now = $new_timestamp->format('Y-m-d H:i:s');

// Find the dismissed notification project ID and reserve a new record_id
$dismissalPid = $module->getSystemProjectIDs('dismissal-pid');
$newRecordId = REDCap::reserveNewRecordId($dismissalPid);

$dismissData = array(
    "record_id"                 => $newRecordId,
    "note_record_id"            => filter_var($_POST['record_id'], FILTER_SANITIZE_STRING),
    "note_name"                 => filter_var($_POST['note_name'], FILTER_SANITIZE_STRING),
    "note_username"             => filter_var($_POST['note_username'], FILTER_SANITIZE_STRING),
    "note_dismissal_datetime"   => $now
);

$results = REDCap::saveData($dismissalPid, 'json', json_encode(array($dismissData)));
$module->emDebug("Save Return results: " . json_encode($results) . " for notification: " . json_encode($dismissData));
if (empty($results['errors'])) {
    print 1;
} else {
    print 0;
}
