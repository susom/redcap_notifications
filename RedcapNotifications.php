<?php
namespace Stanford\RedcapNotifications;

require_once "emLoggerTrait.php";
//require_once "js/notifications.js";

use DateTime;
use REDCap;
use Exception;

class RedcapNotifications extends \ExternalModules\AbstractExternalModule {

    use emLoggerTrait;

    const DEFAULT_NOTIF_SNOOZE_TIME_MIN     = 5;
    const DEFAULT_NOTIF_REFRESH_TIME_HOUR   = 6;

    public function __construct() {
		parent::__construct();
	}

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

            // Save the last record update date/time
            $saveData = array(
                array(
                    "record_id" => $record,
                    "note_last_update_time" => (new DateTime())->format('Y-m-d H:i:s')
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

        try {
            // in case we are loading record homepage load its the record children if existed
            $this->injectREDCapNotifs();
        } catch (\Exception $e) {
            // TODO routine to handle exception , probably nothing, catch them next time.
        }
    }

    /**
     * This function refreshes a users notifications and stores it in the cookie called redcapNotifications
     *
     * @param $user
     * @param $since_last_update
     * @param $project_or_system_or_both
     * @return array|null
     */
    public function refreshNotifications($user, $since_last_update=null, $project_or_system_or_both=null) {

        $this->emDebug("In refreshNotifications: since last update: $since_last_update, note type: $project_or_system_or_both, for user $user");
        if (empty($project_or_system_or_both)) {
            return null;
        }

        // Retrieve projects which hold the notifications and dismissals
        $notification_pid   = $this->getSystemProjectIDs('notification-pid');
        $dismissal_pid      = $this->getSystemProjectIDs('dismissal-pid');

        // Get current timestamp so we can pull notifications that are still open
        $new_timestamp      = new DateTime();
        $now                = $new_timestamp->format('Y-m-d H:i:s');

        // Find which projects this user is a member - Some notifications may target all
        // Project Admins so we also need to check if this person is a project admin on
        // any project.
        [$allProjectslists, $projAdminProjects] = $this->getAllProjectList($user, $now);
        $this->emDebug("All project list: " . json_encode($allProjectslists));

        // Retrieve list of projects that this person is a Designated Contact
        $dcProjects         = $this->getDCProjectList($user);
        $this->emDebug("Designated Contact projects: " . json_encode($dcProjects));

        // Get list of notifications that have already been dismissed and should not be displayed again
        $dismissed          = $this->getDismissedNotifications($dismissal_pid, $user);
        $this->emDebug("Dismissed Notifications: " . json_encode($dismissed));

        $notif_proj_payload = array();
        $notif_sys_payload = array();

        // Only retrieve project notifications if asked for
        if ($project_or_system_or_both == 'project' || $project_or_system_or_both == 'both') {

            // Pull all project level notifications
            $notif_proj_payload    = $this->getProjectNotifications($notification_pid, $now, $allProjectslists, $dcProjects,
                            $projAdminProjects, $dismissed, $since_last_update);
        }

        // Only retrieve system notifications if asked for
        if ($project_or_system_or_both == 'system' || $project_or_system_or_both == 'both') {

            // Pull all system notifications
            $proj_admin = !empty($projAdminProjects);
            $notif_sys_payload     = $this->getSystemNotifications($notification_pid, $now, $dcProjects,
                        $proj_admin, $dismissed, $since_last_update);
        }

        $notif_payload = array_merge($notif_proj_payload, $notif_sys_payload);
        $this->emDebug("Notification Payload:", json_encode($notif_payload));

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
     * @param $notification_pid
     * @param $now
     * @param $dcProjects
     * @param $proj_admin
     * @param $dismissed
     * @param $since_last_update
     * @return array
     */
    private function getSystemNotifications($notification_pid, $now, $dcProjects, $proj_admin, $dismissed, $since_last_update)  {
        //TODO WHAT WRONG WITH SYNTAX ADDING "OR [note_end_dt] == ''" ????
        // We are first pulling 'general' notifications that are not project dependant
        $filter = "([note_project_id] = '') and ([note_end_dt] > '" . $now . "')" .
                    " and ([notifications_complete] = '2' || true)";
        if (!empty($since_last_update)) {
            $filter .= " and ([note_last_update_time] > '" . $since_last_update . "')";
        }

        // Retrieve notifications that fit the criteria
        $active_notifications   = REDCap::getData($notification_pid, 'json', null, null, null, null, null, null, null, $filter);
        $sys_notifications      = json_decode($active_notifications, true);

        // Check if this notification pertains to this user
        $sysNotifications = array();
        $repeatMsg = array();
        foreach($sys_notifications as $notification) {

            // if this alert record_id is in the dismissed list, don't display anymore
            if (!in_array($notification['record_id'], $dismissed)) {

                // Check to see if this is a repeat message.  We don't want to show the same message multiple times
                if (!in_array($notification['note_name'], $repeatMsg)) {
                    $repeatMsg[] = $notification['note_name'];

                    // This is a unique notification that was not dismissed, add it if it fits my user category
                    if ($notification['note_user_types'] == 'all') {
                        // If this notification is for everyone, add it to my active notification list
                        $sysNotifications[] = $notification;

                    } else if ($notification['note_user_types'] = 'admin' and $proj_admin) {
                        // If this notification is for project admins and I am a project admin, add it to my list
                        $sysNotifications[] = $notification;

                    } else if ($notification['note_user_types'] = 'dc' and !empty($dcProjects)) {
                        // If this notification is for designated contacts and I am a designated contact, add it to my list
                        $sysNotifications[] = $notification;
                    }
                }
            }
        }

        return $sysNotifications;
    }

    /**
     * Retrieves a list of project level notifications for this user. Displays the same notification once
     * even if there are many instances of it.
     *
     * @param $notification_pid
     * @param $now
     * @param $allProjectslists
     * @param $dcProjects
     * @param $projAdminProjects
     * @param $dismissed
     * @param $since_last_update
     * @return array
     */
    private function getProjectNotifications($notification_pid, $now, $allProjectslists, $dcProjects, $projAdminProjects, $dismissed, $since_last_update) {
        //TODO WHAT WRONG WITH SYNTAX ADDING "OR [note_end_dt] == ''" ????
        // Now check for project level notifications that are active and we are a member
        $filter = "([note_project_id] <> '') and ([note_end_dt] > '" . $now . "') and ([notifications_complete] = '2' || true) ";
        if (!empty($since_last_update)) {
            $filter .= " and ([note_last_update_time] > '" . $since_last_update . "') ";
        }

        // Retrieve notifications that fit the criteria and we are on the project
        $active_notifications   = REDCap::getData($notification_pid, 'json', null, null, null, null, null, null, null, $filter);
        $proj_notifications     = json_decode($active_notifications, true);

        $projNotifications  = array();
        $repeatMsg          = array();
        foreach($proj_notifications as $notification) {

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
    public function injectREDCapNotifs()
    {
        $dismissal_cb   = $this->getUrl("pages/DismissalCallBack.php");
        $refresh_notifs = $this->getUrl("pages/refreshNotifs.php");
        $notif_css      = $this->getUrl("assets/styles/redcap_notifs.css");
        $notifs_js      = $this->getUrl("assets/scripts/redcap_notifs.js");
        $notif_js       = $this->getUrl("assets/scripts/redcap_notif.js");
        $cur_user       = $this->getUser()->getUsername();
        $snooze_duration    = $this->getSystemSetting("redcap-notifs-snooze-minutes") ?? self::DEFAULT_NOTIF_SNOOZE_TIME_MIN;
        $force_refresh      = $this->getSystemSetting("redcap-notifs-refresh-limit") ?? self::DEFAULT_NOTIF_REFRESH_TIME_HOUR;
        ?>
        <link rel="stylesheet" href="<?= $notif_css ?>">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-cookie/1.4.1/jquery.cookie.min.js" integrity="sha512-3j3VU6WC5rPQB4Ld1jnLV7Kd5xr+cq9avvhwqzbH/taCRNURoeEpoPBK9pDyeukwSxwRPJ8fDgvYXd6SkaZ2TA==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
        <script src="<?= $notif_js ?>" type="text/javascript"></script>
        <script src="<?= $notifs_js ?>" type="text/javascript"></script>
        <script>
            var dismissal_cb        = "<?=$dismissal_cb?>";
            var refresh_notifs      = "<?=$refresh_notifs?>";
            var cur_user            = "<?=$cur_user?>";
            var cur_page            = "<?=PAGE?>";
            var redcap_csrf_token   = "<?=$this->getCSRFToken()?>";
            var snooze_duration     = "<?=$snooze_duration?>";
            var force_refresh       = "<?=$force_refresh?>";

            $(window).on('load', function () {
                var notifs_config = {
                    "current_user" : cur_user,
                    "refresh_notifs_endpoint" : refresh_notifs,
                    "dismiss_notifs_endpoint" : dismissal_cb,
                    "redcap_csrf_token" : redcap_csrf_token,
                    "snooze_duration" : snooze_duration,
                    "force_refresh" : force_refresh,
                    "current_page" : cur_page
                }
                var rc_notifs = new RCNotifs(notifs_config);
            });
        </script>
        <?php
    }

}
