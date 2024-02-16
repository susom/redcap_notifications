<?php

namespace Stanford\RedcapNotifications;
require_once "vendor/autoload.php";
require_once "emLoggerTrait.php";
require_once "classes/CacheInterface.php";
require_once "classes/Redis.php";
require_once "classes/Database.php";
require_once "classes/CacheFactory.php";

use Composer\XdebugHandler\Process;
use REDCap;
use Exception;
use DateTime;
use REDCapEntity\Page;


class RedcapNotifications extends \ExternalModules\AbstractExternalModule
{

    use emLoggerTrait;

    const DEFAULT_NOTIF_SNOOZE_TIME_MIN = 5;
    const DEFAULT_NOTIF_REFRESH_TIME_HOUR = 6;
    private $SURVEY_USER = '[survey respondent]';

    /**
     * @var \Stanford\RedcapNotificationsAPI\RedcapNotificationsAPI
     */
    private $APIObject;
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

    /**
     * Call client to inject banners or modal notifications
     *
     * @param $project_id
     * @return void
     */
    function redcap_every_page_top($project_id)
    {
        if (defined('USERID')) //Ensure user is logged in before attempting to render any notifications
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

            if (in_array(PAGE, $allowed_pages))
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
    public function refreshNotifications($pid, $user, $since_last_update = null, $project_or_system_or_both = null)
    {
        $refreshStart = hrtime(true);

        $this->emDebug("In refreshNotifications: pid $pid, since last update: $since_last_update, note type: $project_or_system_or_both, for user $user");

        if (empty($project_or_system_or_both)) {
            return null;
        }

        // Retrieve projects which hold the notifications and dismissals
        $notification_pid = $this->getSystemProjectIDs('notification-pid');
        $dismissal_pid = $this->getSystemProjectIDs('dismissal-pid');

        // Get current timestamp so we can pull notifications that are still open
        $now = (new DateTime())->format('Y-m-d H:i:s');

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
            $dismissed = $this->getDismissedNotifications($dismissal_pid, $user);
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
            $notif_proj_payload = $this->getProjectNotifications($user, $notification_pid, $now, $allProjectslists,
                $dcProjects, $projAdminProjects, $dismissed, $since_last_update, $pid);
        }

        // Only retrieve system notifications if asked for
        if ($project_or_system_or_both == 'system' || $project_or_system_or_both == 'both') {

            // Pull all system notifications
            $notif_sys_payload = $this->getSystemNotifications($user, $notification_pid, $now, $dcProjects,
                $projAdminProjects, $dismissed, $since_last_update, $pid);
        }

        $notif_payload = array_merge($notif_proj_payload, $notif_sys_payload);
        $this->emDebug("Notification Payload:", json_encode($notif_payload));

        // changes nanoseconds to milliseconds and stores in log
        $refreshEnd = hrtime(true);
        $refreshTime = ($refreshEnd - $refreshStart) / 1e+6;
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
    public function getSystemProjectIDs($whichProj)
    {
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
    private function getAllProjectList($user, $now)
    {

        // Retrieve all projects that this user is associated with but make sure the user has not expired
        $db_return = $this->query(
            'select rur.project_id, roles.role_name, rur.user_rights, rur.design
                        from redcap_user_rights rur
                        left outer join redcap_user_roles roles on rur.role_id = roles.role_id
                        where username = ?
                        and (rur.expiration is null or rur.expiration > cast(? as date))', [$user, $now]
        );

        $allProjList = array();
        $projAdminList = array();
        while ($row = $db_return->fetch_assoc()) {
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
    private function getDCProjectList($user)
    {

        $dcProjList = array();

        // See if the designated_contact_selected table exists in the database.  If not, return empty array.
        try {
            $dbReturn = $this->query(
                "select count(table_name)
                    from information_schema.TABLES
                    where TABLE_NAME = 'designated_contact_selected'", []
            );
        } catch (Exception $ex) {
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
                                            $dismissed, $since_last_update, $pid)
    {

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
        foreach ($sys_notifications as $notification) {

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
    private function excludeProjects($projects, $excludeList)
    {

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
    private function thisProjectExcluded($project, $excludeList)
    {

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
                                             $projAdminProjects, $dismissed, $since_last_update, $pid)
    {

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

        $projNotifications = array();
        $repeatMsg = array();
        foreach ($projNotificationsList as $notification) {

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
    private function getDismissedNotifications($dismissal_pid, $user)
    {
        $filter = "[note_username] = '" . $user . "'";
        $dismissed = REDCap::getData($dismissal_pid, 'json', null, null, null, null, null, null, null, $filter);
        $dismissed_array = json_decode($dismissed, true);

        $dismissedNote = array();
        foreach ($dismissed_array as $each_dismissed) {
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
    public function injectREDCapNotifs()
    {
        global $Proj;

        $jsmo = $this->getUrl("assets/scripts/jsmo.js", true);
        $utility_js = $this->getUrl("assets/scripts/utility.js", true);

        $notif_cls = $this->getUrl("assets/scripts/Notification.js", true);
        $notif_css = $this->getUrl("assets/styles/redcap_notifs.css", true);
        $notif_controller = $this->getUrl("assets/scripts/NotificationController.js", true);

        $cur_user = $this->getUser()->getUsername();
        $snooze_duration = $this->getSystemSetting("redcap-notifs-snooze-minutes") ?? self::DEFAULT_NOTIF_SNOOZE_TIME_MIN;
        $refresh_limit = $this->getSystemSetting("redcap-notifs-refresh-limit") ?? self::DEFAULT_NOTIF_REFRESH_TIME_HOUR;

        //DATA TO INIT JSMO module
        $notifs_config = array(
            "current_user" => $this->clean_user($cur_user),
            "snooze_duration" => $snooze_duration,
            "refresh_limit" => $refresh_limit,
            "current_page" => PAGE,
            "project_id" => !empty($Proj) ? $Proj->project_id : null,
            "dev_prod_status" => !empty($Proj) ? $Proj->status : null,
            "php_session" => session_id()
        );

        //Initialize JSMO
        $this->initializeJavascriptModuleObject();
//        $this->processJobQueue();
        ?>
        <script src="<?= $notif_controller ?>" type="text/javascript"></script>
        <script src="<?= $utility_js ?>" type="text/javascript"></script>
        <script src="<?= $notif_cls ?>" type="text/javascript"></script>
        <script src="<?= $jsmo ?>" type="text/javascript"></script>
        <link rel="stylesheet" href="<?= $notif_css ?>">
        <script>
            $(function () {
                const module = <?=$this->getJavascriptModuleObjectName()?>;
                module.config = <?=json_encode($notifs_config)?>;
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
    public function clean_user($user)
    {
        $user = str_replace(" ", "_", $user);
        $user = str_replace("[", "", $user);
        $user = str_replace("]", "", $user);
        return $user;
    }


    /**
     * display emdebugs only for custom comma delimited list of userids to debug for select subset of userids to try to find out why they constantly callback for notif payloads
     *
     * @param
     * @return void
     */
    public function emDebugForCustomUseridList()
    {
        $temp = $this->getSystemSetting("user-specific-log-list");
        $temp = str_replace(" ", "", $temp);
        $custom_log_list = empty($temp) ? [] : explode(",", $temp);

        $cur_user = $this->getUser()->getUsername();
        if (in_array($cur_user, $custom_log_list)) {
            $args = func_get_args();
            $this->emDebug("REDCapNotifs Custom Debug for $cur_user", $args);
        }
    }


    /* AJAX HANDLING IN HERE INSTEAD OF A STAND ALONE PAGE? */
    public function redcap_module_ajax($action, $payload, $project_id, $record, $instrument, $event_id, $repeat_instance, $survey_hash, $response_id, $survey_queue_hash, $page, $page_full, $user_id, $group_id) {
        $return_o = ["success" => false];

        //NO LONGER SEPARATE ACTIONS, THEY ALL FLOW THROUGH QUEUE
        //REMOVE THIS SWITCH WHEN WORKFLOW FINALIZED
        switch ($action) {
            case "get_full_payload":

           // case "check_forced_refresh":

                // CHECK
                // IS QUEUE AVAILABLE?
                // x IS JOB ALREADY IN QUEUE?

                // YES
                // x DOES IT HAVE FINISHED PROCESSED PAYLOAD?
                // x Yes, RETURN PAYLOAD, DELETE FROM QUEUE
                // No, UPDATE PARAMETERS (IN CASE MORE DISMISALLS HAPPENED SINCE LAST TIME) RETURN EMPTY PAYLOAD

                // NO
                // x APPEND TO QUEUE and return empty payload
                $apiObject = $this->getAPIObject();
                if ($apiObject) {
                    $project_id = null;
                    $admin_rights = null;
                    $project_status = null;
                    if (defined('PROJECT_ID')) {
                        $project_id = PROJECT_ID;
                        global $Proj;
                        $project_status = $Proj->project['status'];
                    }
                    if (defined('ADMIN_RIGHTS')) {
                        $admin_rights = ADMIN_RIGHTS;
                    }
                    $return_o = $apiObject->getNotifications($project_id, $project_status, $admin_rights);
                } else {
                    throw new \Exception("No notifications");
                }
                break;
            case "save_dismissals":
                $dismiss_notifs = $payload;
                    if (count($dismiss_notifs)) {
                        try {
                            $apiObject = $this->getAPIObject();
                            if ($apiObject) {
                                foreach ($dismiss_notifs as $notif) {
                                    if(!$apiObject->dismissNotification($notif)){
                                        throw new \Exception("Cant dismiss Notification '" .$notif["record_id"]. "'");
                                    };
                                    $return_o[] = $notif;
                                }
                                 $this->emDebug("need to return the dismissed record_ids", $return_o);

                            } else {
                                throw new \Exception("No notifications");
                            }
                        } catch (\Exception $e) {
                            return $e->getMessage();
                        };
                    } else {
                        $this->emError("Cannot save dismissed notification because record set was empty or there was invalid data");
                    }
            default:
                $this->emError("Invalid Action");
                break;
        }

        // Return is left as php object, is converted automatically
        return $return_o;
    }


    /**
     * @return \Stanford\RedcapNotificationsAPI\RedcapNotificationsAPI
     */
    public function getAPIObject()
    {
        // check Notification EM is enabled first.
        if (!$this->APIObject and $this->framework->isModuleEnabled($this->getSystemSetting('notification-api'))) {
            $this->setAPIObject(\ExternalModules\ExternalModules::getModuleInstance($this->getSystemSetting('notification-api')));
        } else {
            REDCap::logEvent('REDCap Notification EM is not Enabled.');
        }
        return $this->APIObject;
    }

    /**
     * @param \Stanford\RedcapNotificationsAPI\RedcapNotificationsAPI $APIObject
     */
    public function setAPIObject(\Stanford\RedcapNotificationsAPI\RedcapNotificationsAPI $APIObject): void
    {
        $this->APIObject = $APIObject;
    }


}

function isValid($date, $format = 'Y-m-d')
{
    $dt = DateTime::createFromFormat($format, $date);
    return $dt && $dt->format($format) === $date;
}
