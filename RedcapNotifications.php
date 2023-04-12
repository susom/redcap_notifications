<?php
namespace Stanford\RedcapNotifications;

require_once "emLoggerTrait.php";

use REDCap;
use Exception;
use DateTime;
use REDCapEntity\Page;

class RedcapNotifications extends \ExternalModules\AbstractExternalModule {

    use emLoggerTrait;

    const DEFAULT_NOTIF_SNOOZE_TIME_MIN     = 5;
    const DEFAULT_NOTIF_REFRESH_TIME_HOUR   = 6;
    private $SURVEY_USER                    = '[survey respondent]';

//    public function __construct() {
//		parent::__construct();
//	}

    /**
     *  Using this function to update the [note_last_update_time] field of a notification
     *  record so we can tell when it's been changed in the REDCap Notifications Project.
     *
     * @param $project_id
     * @param $record
     * @param $instrument
     * @param $event_id
     * @param $group_id
     * @param $survey_hash
     * @param $response_id
     * @param $repeat_instance
     * @return void
     */
    function redcap_save_record($project_id, $record, $instrument, $event_id, $group_id,
                                $survey_hash, $response_id, $repeat_instance)
    {
        // If this is the notification project, update the latest update date
        $notification_pid = $this->getSystemProjectIDs('notification-pid');
        if ($notification_pid == $project_id and !empty($record)) {

            $last_update_ts = (new DateTime())->format('Y-m-d H:i:s');

            $params = array(
                "records" => $record,
                "return_format" => "json",
                "fields" => array("force_refresh")
            );
            $json       = REDCap::getData($params);
            $response   = json_decode($json,true);

            if(!empty($response) && $response = current($response)){
                $this->emDebug("forcer refresh get data?", $response);
                if($response["force_refresh___1"] == "1"){
                    $this->setForceRefreshSetting($record, $last_update_ts);
                }
            }

            // Save the last record update date/time
            $saveData = array(
                array(
                    "record_id" => $record,
                    "note_last_update_time" => $last_update_ts
                )
            );
            $response = REDCap::saveData('json', json_encode($saveData), 'overwrite');
            if (!empty($response['errors'])) {
                $this->emError("Could not update record with last update time " . json_encode($saveData));
            }
        }
    }

    /**
     * Call client to inject banners or modal notifications
     *
     * @param $project_id
     * @return void
     */
    function redcap_every_page_top($project_id) {
        if(defined('USERID')) //Ensure user is logged in before attempting to render any notifications
        {
            $allowed_pages = [
                'ProjectSetup/index.php',
                'ProjectSetup/other_functionality.php',
                'index.php',
                'Design/online_designer.php',
                'Surveys/invite_participants.php',
                'DataEntry/record_status_dashboard.php',
                'DataExport/index.php',
                'UserRights/index.php'
            ];

            if(in_array(PAGE, $allowed_pages))
                $this->injectREDCapNotifs();
        }
    }

    /**
     * This function refreshes a users notifications and stores it in the cookie called redcapNotifications
     *
     * @param $pid
     * @param $user
     * @param $since_last_update
     * @param $project_or_system_or_both
     * @return array|null
     */
    public function refreshNotifications($pid, $user, $since_last_update=null, $project_or_system_or_both=null) {
        //TODO MAKE SURE THIS DOESNT FIRE
//        return;
        $refreshStart = hrtime(true);

        $this->emDebug("In refreshNotifications: pid $pid, since last update: $since_last_update, note type: $project_or_system_or_both, for user $user");
        $this->emDebug("why i aint getting shit?", $project_or_system_or_both);

        if (empty($project_or_system_or_both)) {
            return null;
        }

        // Retrieve projects which hold the notifications and dismissals
        $notification_pid   = $this->getSystemProjectIDs('notification-pid');
        $dismissal_pid      = $this->getSystemProjectIDs('dismissal-pid');

        // Get current timestamp so we can pull notifications that are still open
        $now                = (new DateTime())->format('Y-m-d H:i:s');

        // Find which projects this user is a member - Some notifications may target all
        // Project Admins so we also need to check if this person is a project admin on
        // any project.
        if ($user === $this->SURVEY_USER) {
            // If the user is a survey respondent, skip the retrieval for dismissed notifications and DC
            $this->emDebug("This is a survey respondant: " . $user);
            $allProjectslists = array($pid);
            $dcProjects = [];
            $dismissed = [];
            $projAdminProjects = [];
        } else {

            // Retrieve list of projects that this person is a Designated Contact
            [$allProjectslists, $projAdminProjects] = $this->getAllProjectList($user, $now);
            $dcProjects = $this->getDCProjectList($user);

            // Get list of notifications that have already been dismissed and should not be displayed again
            $dismissed          = $this->getDismissedNotifications($dismissal_pid, $user);
        }

        $this->emDebug("All project list: " . json_encode($allProjectslists));
        $this->emDebug("Designated Contact projects: " . json_encode($dcProjects));
        $this->emDebug("Project Admin Notifications: " . json_encode($projAdminProjects));
        $this->emDebug("Dismissed Notifications: " . json_encode($dismissed));

        $notif_proj_payload = array();
        $notif_sys_payload = array();

        // Only retrieve project notifications if asked for
        if ($project_or_system_or_both == 'project' || $project_or_system_or_both == 'both') {

            // Pull all project level notifications
            $notif_proj_payload    = $this->getProjectNotifications($user, $notification_pid, $now, $allProjectslists,
                $dcProjects, $projAdminProjects, $dismissed, $since_last_update, $pid);
        }

        // Only retrieve system notifications if asked for
        if ($project_or_system_or_both == 'system' || $project_or_system_or_both == 'both') {

            // Pull all system notifications
            $notif_sys_payload     = $this->getSystemNotifications($user, $notification_pid, $now, $dcProjects,
                $projAdminProjects, $dismissed, $since_last_update, $pid);
        }

        $notif_payload = array_merge($notif_proj_payload, $notif_sys_payload);
        $this->emDebug("Notification Payload:", json_encode($notif_payload));

        // changes nanoseconds to milliseconds and stores in log
        $refreshEnd = hrtime(true);
        $refreshTime = ($refreshEnd - $refreshStart)/1e+6;
        //REDCap::logEvent("The refresh payload for user $user took $refreshTime milliseconds");
        $this->emDebug("The refresh payload for user $user took $refreshTime milliseconds");
        $this->emDebugForCustomUseridList("Why constant refresh?", $user, $pid, $since_last_update, $project_or_system_or_both);
        return [
             "notifs" => $notif_payload,
             "server_time" => $now
        ];
    }


    /**
     * Retrieves system setting in the EM config file for desired project.
     *
     * @return string
     */
    public function getSystemProjectIDs($whichProj) {
        return $this->getSystemSetting($whichProj);
    }


    /**
     * Retrieves list of all REDCap projects for this user. Also, filters the list to return a list of
     * projects that this person is a Project Admin on.
     *
     * @param $user
     * @param $now
     * @return array[]
     */
    private function getAllProjectList($user, $now) {

        // Retrieve all projects that this user is associated with but make sure the user has not expired
        $db_return = $this->query(
                'select rur.project_id, roles.role_name, rur.user_rights, rur.design
                        from redcap_user_rights rur
                        left outer join redcap_user_roles roles on rur.role_id = roles.role_id
                        where username = ?
                        and (rur.expiration is null or rur.expiration > cast(? as date))', [$user, $now]
        );

        $allProjList    = array();
        $projAdminList  = array();
        while($row = $db_return->fetch_assoc()){
            $allProjList[] = $row['project_id'];
            if (empty($row['role_name']) and $row['user_rights'] = '1' and $row['design'] = '1') {
                $projAdminList[] = $row['project_id'];
            } else if (strpos('Admin', $row['role_name'])) {
                $projAdminList[] = $row['project_id'];
            }
        }

        return [$allProjList, $projAdminList];
    }

    /**
     * Retrieves list of projects that this person is the Designated Contact.
     *
     * @param $user
     * @return array
     */
    private function getDCProjectList($user) {

        $dcProjList = array();

        // See if the designated_contact_selected table exists in the database.  If not, return empty array.
        try {
            $dbReturn = $this->query(
                "select count(table_name)
                    from information_schema.TABLES
                    where TABLE_NAME = 'designated_contact_selected'", []
            );
        } catch(Exception $ex) {
            $this->emError("Exception when querying for DC: ", $ex->getMessage());
        }

        // Table exists
        if ($dbReturn->fetch_row()[0] == 1) {
            // Retrieve projects that I am a DC
            $dbReturn = $this->query(
                'select project_id
                        from designated_contact_selected
                        where contact_userid = ?', [$user]
            );

            while ($row = $dbReturn->fetch_assoc()) {
                $dcProjList[] = $row['project_id'];
            }
        }

        return $dcProjList;
    }

    /**
     * Retrieves list of system notifications for this user. Displays each notification once even if there
     * are multiple instances of it.
     *
     * @param $user
     * @param $notification_pid
     * @param $now
     * @param $dcProjects
     * @param $proj_admin
     * @param $dismissed
     * @param $since_last_update
     * @param $pid
     * @return array
     */
    private function getSystemNotifications($user, $notification_pid, $now, $dcProjects, $projAdminProjects,
                                            $dismissed, $since_last_update, $pid)  {

        // We are first pulling 'general' notifications that are not project dependant
        if ($this->SURVEY_USER == $user) {
            $filter = "([note_project_id] = '') and ([notifications_complete] = '2')" .
                " and (([note_end_dt] > '" . $now . "') or ([note_end_dt] = ''))" .
                " and ([note_display(survey)] = '1')";
        } else {
            $filter = "([note_project_id] = '') and ([notifications_complete] = '2')" .
                " and (([note_end_dt] > '" . $now . "') or ([note_end_dt] = ''))";
            if (!empty($since_last_update)) {
                $filter .= " and ([note_last_update_time] > '" . $since_last_update . "')";
            }
        }
        $this->emDebug("System Filter: " . $filter);

        // Retrieve system notification list
        $sys_notifications = $this->getNotificationList($notification_pid, $filter);

        // Check if this notification pertains to this user
        $sysNotifications = array();
        $repeatMsg = array();
        foreach($sys_notifications as $notification) {

            if ($this->SURVEY_USER == $user) {
                if (empty($repeatMsg[$notification['note_name']])) {
                    // Check the exclusion list to see if our project is excluded
                    $excluded = $this->thisProjectExcluded($pid, $notification['project_exclusion']);
                    if (!$excluded) {
                        $repeatMsg[$notification['note_name']] = 1;
                        $sysNotifications[] = $notification;
                    }
                } else {
                    $repeatMsg[$notification['note_name']]++;
                }

            } else {

                // if this alert record_id is in the dismissed list, don't display anymore
                if (!in_array($notification['record_id'], $dismissed)) {

                    // Check to see if this is a repeat message.  We don't want to show the same message multiple times
                    if (!in_array($notification['note_name'], $repeatMsg)) {
                        $repeatMsg[] = $notification['note_name'];

                        // This is a unique notification that was not dismissed, add it if it fits my user category
                        if ($notification['note_user_types'] == 'all') {
                            // If this notification is for everyone, add it to my active notification list
                            $sysNotifications[] = $notification;

                        } else if ($notification['note_user_types'] = 'admin' and !empty($projAdminProjects)) {

                            // If this notification is for project admins and I am a project admin on a project not on the
                            // Project exclusion list
                            if (!empty($notification['project_exclusion'])) {
                                $filteredProjList = $this->excludeProjects($projAdminProjects, $notification['project_exclusion']);
                            } else {
                                $filteredProjList = $projAdminProjects;
                            }

                            if (!empty($filteredProjList)) {
                                $sysNotifications[] = $notification;
                            }

                        } else if ($notification['note_user_types'] = 'dc' and !empty($dcProjects)) {

                            // If this notification is for designated contacts and I am a designated contact not on the
                            // project exclusion list, add it to my list
                            if (!empty($notification['project_exclusion'])) {
                                $filteredDCList = $this->excludeProjects($dcProjects, $notification['project_exclusion']);
                            } else {
                                $filteredDCList = $dcProjects;
                            }

                            if (!empty($filteredDCList)) {
                                $sysNotifications[] = $notification;
                            }

                        }
                    }
                }
            }
        }

        return $sysNotifications;
    }


    /**
     * Retrieve the list of projects based on the filter
     *
     * @param $notification_pid
     * @param $filter
     * @return array of notifications
     */
    private function getNotificationList($notification_pid, $filter)
    {
        // Retrieve notifications that fit the criteria
        $params = array(
            'project_id' => $notification_pid,
            'return_format' => 'json',
            'filterLogic' => $filter
        );
        $active_notifications = REDCap::getData($params);
        return json_decode($active_notifications, true);

    }

    /**
     * Exclude a list of projects from the list of projects passed in.
     *
     * @param $projAdminProjects
     * @param $excludeList
     * @return array
     */
    private function excludeProjects($projects, $excludeList) {

        // Convert excluded project list into array and delete those projects from the Admin Project list
        $excludedProjs = explode(',', $excludeList);
        return array_diff($projects, $excludedProjs);
    }

    /**
     * This function will check the list of excluded projects to see if this project
     * should be included in the notification or not.
     *
     * @param $project
     * @param $excludeList
     * @return bool
     */
    private function thisProjectExcluded($project, $excludeList) {

        // Convert excluded project list into array and delete those projects from the Admin Project list
        $excludedProjs = explode(',', $excludeList);
        return in_array($project, $excludedProjs);
    }

    /**
     * Retrieves a list of project level notifications for this user. Displays the same notification once
     * even if there are many instances of it.
     *
     * @param $user
     * @param $notification_pid
     * @param $now
     * @param $allProjectslists
     * @param $dcProjects
     * @param $projAdminProjects
     * @param $dismissed
     * @param $since_last_update
     * @param $pid
     * @return array
     */
    private function getProjectNotifications($user, $notification_pid, $now, $allProjectslists, $dcProjects,
                                             $projAdminProjects, $dismissed, $since_last_update, $pid) {

        if ($user == $this->SURVEY_USER) {
            // This user is a survey respondent.  Only look for notifications that should be displayed on the survey page
            $filter = "([notifications_complete] = '2') and ([note_display(survey)] = '1')" .
                " and (([note_end_dt] > '" . $now . "') or ([note_end_dt] = '')) and ([note_project_id] = $pid)";
        } else {
            // Now check for project level notifications that are active and we are a member
            $filter = "([note_project_id] <> '') and ([notifications_complete] = '2') " .
                " and (([note_end_dt] > '" . $now . "') or ([note_end_dt] = ''))";
            if (!empty($since_last_update)) {
                $filter .= " and ([note_last_update_time] > '" . $since_last_update . "') ";
            }
        }
        $this->emDebug("This is the Project filter: " . $filter);

        // Retrieve project notification list
        $projNotificationsList = $this->getNotificationList($notification_pid, $filter);

        $projNotifications  = array();
        $repeatMsg          = array();
        foreach($projNotificationsList as $notification) {

            if ($user == $this->SURVEY_USER) {
                // For survey users, we need to see which notifications may pertain to our survey
                // Make sure there are no repeats
                if (empty($repeatMsg[$notification['note_name']][$notification['note_project_id']])) {
                    $repeatMsg[$notification['note_name']][$notification['note_project_id']] = 1;
                    $projNotifications[] = $notification;
                } else {
                    $repeatMsg[$notification['note_name']][$notification['note_project_id']]++;
                }

            } else {
                // This notifications are for specific users.
                // If this alert record_id is in the dismissed list, don't display anymore. Also, make sure we are a member
                // of the project before adding to our list
                if (!in_array($notification['record_id'], $dismissed) and in_array($notification['note_project_id'], $allProjectslists)) {

                    // Check to see if this is a repeat message.  We do not want to show the same message multiple times.
                    // Since these messages are project based, check the message Subject and the project id
                    if (empty($repeatMsg[$notification['note_name']][$notification['note_project_id']])) {
                        $repeatMsg[$notification['note_name']][$notification['note_project_id']] = 1;

                        // This notification for this project id has been entered yet, add it to my project notification list
                        if ($notification['note_user_types'] == 'all') {
                            // If this notification is for everyone, add it to my active notification list
                            $projNotifications[] = $notification;

                        } else if ($notification['note_user_types'] = 'admin' and
                            in_array($notification['note_project_id'], $projAdminProjects)) {
                            // If this notification is for project admins and I am a project admin on this project, add it to my list
                            $projNotifications[] = $notification;

                        } else if ($notification['note_user_types'] = 'dc' and
                            in_array($notification['note_project_id'], $dcProjects)) {
                            // If this notification is for designated contacts and I am a designated contact for this project, add it to my list
                            $projNotifications[] = $notification;
                        }
                    } else {
                        $repeatMsg[$notification['note_name']][$notification['note_project_id']]++;
                    }
                }
            }
        }
        return $projNotifications;
    }

    /**
     * Retrieves list of notifications that were previously dismissed to filter them out.
     *
     * @param $dismissal_pid
     * @param $user
     * @return array
     */
    private function getDismissedNotifications($dismissal_pid, $user) {
        $filter     = "[note_username] = '" . $user . "'";
        $dismissed  = REDCap::getData($dismissal_pid, 'json', null, null, null, null, null, null, null, $filter);
        $dismissed_array = json_decode($dismissed,true);

        $dismissedNote = array();
        foreach($dismissed_array as $each_dismissed) {
            $dismissedNote[] = $each_dismissed['note_record_id'];
        }

        return $dismissedNote;
    }


    /**
     * INJECT FRONT END CODE TO DISPLAY ALERTS.
     *
     * @param $alerts
     * @return array
     */
    public function injectREDCapNotifs(){
        global $Proj;

        $notifs_jsmo        = $this->getUrl("assets/scripts/jsmo.js", true);
        $utility_js         = $this->getUrl("assets/scripts/utility.js", true);

        $notif_cls          = $this->getUrl("assets/scripts/Notification.js", true);
        $notif_css          = $this->getUrl("assets/styles/redcap_notifs.css", true);
        $notif_controller   = $this->getUrl("assets/scripts/NotificationController.js", true);

        $cur_user           = $this->getUser()->getUsername();
        $snooze_duration    = $this->getSystemSetting("redcap-notifs-snooze-minutes") ?? self::DEFAULT_NOTIF_SNOOZE_TIME_MIN;
        $refresh_limit      = $this->getSystemSetting("redcap-notifs-refresh-limit") ?? self::DEFAULT_NOTIF_REFRESH_TIME_HOUR;

        //DATA TO INIT JSMO module
        $notifs_config = array(
            "current_user"              => $this->clean_user($cur_user),
            "snooze_duration"           => $snooze_duration,
            "refresh_limit"             => $refresh_limit,
            "current_page"              => PAGE,
            "project_id"                => !empty($Proj) ? $Proj->project_id : null,
            "dev_prod_status"           => !empty($Proj) ? $Proj->status : null
        );

        //Initialize JSMO
        $this->initializeJavascriptModuleObject();
        ?>

        <script src="<?= $notif_controller ?>" type="text/javascript"></script>
        <script src="<?= $utility_js ?>" type="text/javascript"></script>
        <script src="<?= $notif_cls?>" type="text/javascript"></script>
        <script src="<?= $notifs_jsmo?>" type="text/javascript"></script>
        <link rel="stylesheet" href="<?= $notif_css ?>">
        <script>
            $(function() {
                const module    = <?=$this->getJavascriptModuleObjectName()?>;
                module.config   = <?=json_encode($notifs_config)?>;
                module.afterRender(module.InitFunction);
            })
        </script>
        <?php
    }

    /**
     * Clean User Name before passing to front end
     *
     * @param $user
     * @return string
     */
    public function clean_user($user){
        $user = str_replace(" ","_", $user);
        $user = str_replace("[","", $user);
        $user = str_replace("]","", $user);
        return $user;
    }

    /**
     * Get The force Refresh json from system setting
     *
     * @param
     * @return array
     */
    public function getForceRefreshSetting(){
        $existing_json  = $this->getSystemSetting("force_refresh_ts");
        $existing_arr   = empty($existing_json) ? array() : json_decode($existing_json, true);

        return $existing_arr;
    }

    /**
     * Set a new notif record id with timestamp to force refresh
     *
     * @param $record, $last_ts
     * @return void
     */
    public function setForceRefreshSetting($record, $last_ts){
        $existing_arr = $this->getForceRefreshSetting();

        if(!array_key_exists($record, $existing_arr)){
            $existing_arr[$record] = null;
        }

        $existing_arr[$record] = $last_ts;
        $this->setSystemSetting("force_refresh_ts", json_encode($existing_arr));
    }


    /**
     * display emdebugs only for custom comma delimited list of userids to debug for select subset of userids to try to find out why they constantly callback for notif payloads
     *
     * @param
     * @return void
     */
    public function emDebugForCustomUseridList(){
        $temp               = $this->getSystemSetting("user-specific-log-list");
        $temp               = str_replace(" ", "", $temp);
        $custom_log_list    = empty($temp) ? [] : explode(",", $temp);

        $cur_user = $this->getUser()->getUsername();
        if(in_array($cur_user, $custom_log_list)){
            $args = func_get_args();
            $this->emDebug("REDCapNotifs Custom Debug for $cur_user", $args);
        }
    }


    /* AJAX HANDLING IN HERE INSTEAD OF A STAND ALONE PAGE? */
    public function redcap_module_ajax($action, $payload, $project_id, $record, $instrument, $event_id, $repeat_instance, $survey_hash, $response_id, $survey_queue_hash, $page, $page_full, $user_id, $group_id) {
//        $this->emDebug(func_get_args());
//        $this->emDebug("is redcap_module_ajax a reserved name?",
//            $action,
//            $payload,
//            $project_id,
//            $page,
//            $page_full,
//            $user_id
//        );

        $return_o = ["success" => false];

        $this->emDebugForCustomUseridList($action,$payload,$project_id,$page_full);

        switch($action){
            case "refresh":
                try {
                    $last_updated_post  = $payload['last_updated'];
                    $proj_or_sys_post   = $payload['proj_or_sys'];
                    $last_updated       = isValid($last_updated_post, 'Y-m-d H:i:s') ? $last_updated_post : null;
                    $project_or_system  = $proj_or_sys_post ?? null;
                    $all_notifications      = $this->refreshNotifications($project_id, $this->getUser()->getUsername(), $last_updated, $project_or_system);

                    $this->emDebug("no notif payload from refreshNotifications()?", $project_or_system);
                    $return_o               = $all_notifications;
                    $return_o["success"]    = true;
                } catch (\Exception $e) {
                    //Entities::createException($e->getMessage());
                    $return_o               = array('status' => 'error', 'message' => $e->getMessage());
                    $return_o["success"]    = false;
                }

                break;

            case "dismiss":
                /**
                 * This is the callback page from js when notifications are dismissed.  This page will accept the dismissed
                 * notification and store it in the REDCap project which holds dismissed notifications.
                 */

                $dismiss_notifs = $payload['dismiss_notifs'];

                $new_timestamp  = new DateTime();
                $now            = $new_timestamp->format('Y-m-d H:i:s');

                $dismissalPid   = $this->getSystemProjectIDs('dismissal-pid');
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
                    $this->emDebug("need to return the dismissed record_ids", $return_ids);
                    $this->emDebug("Save Return results: " . json_encode($results) . " for notification: " . json_encode($dismissData));

                    $return_o               = $return_ids;
                }else{
                    $this->emError("Cannot save dismissed notification because record set was empty or there was invalid data");
                    $return_o = ["success" => false];
                }

                break;

            case "force_refresh":
                //THEN we poll every 30 seconds? check the flag against and notif against current payload notifs?
                //then force a refresh if the one in EM is > than the update stamp in the payload?

                try {
                    $return_o               = $this->getForceRefreshSetting();
                    $return_o["success"]    = true;
                } catch (\Exception $e) {
                    $return_o               = array('status' => 'error', 'message' => $e->getMessage());
                    $return_o["success"]    = false;
                }
                break;

            default:
                $this->emError("Invalid Action");
                $return_o = ["success" => false];
                break;
        }

        // Return is left as php object, is converted automatically
        return $return_o;
    }
}

function isValid($date, $format = 'Y-m-d'){
    $dt = DateTime::createFromFormat($format, $date);
    return $dt && $dt->format($format) === $date;
}
