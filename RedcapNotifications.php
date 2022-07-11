<?php
namespace Stanford\RedcapNotifications;

require_once "emLoggerTrait.php";
require_once "js/notifications.js";

use DateTime;
use REDCap;

class RedcapNotifications extends \ExternalModules\AbstractExternalModule {

    use emLoggerTrait;
    const COOKIE_NAME = "redcapNotifications";

    public function __construct() {
		parent::__construct();
	}

    function redcap_every_page_top($project_id) {

        // If this is the Home page, update the list of notifications which pertain to this user
        // This can be changed but is a start.  refreshNotifications can be called on a timer to refresh
        // at whatever rate we thing is necessary.
        if (PAGE == 'index.php' and empty($_GET) ) {

            // Retrieve the list of notifications to send to client
            $this->refreshNotifications($this->getUser()->getUsername());
        }

        // Call javascript to insert notifications onto the page depending on what type of page it is
        $this->emDebug("Page in redcap_every_page_top: " . PAGE . ", action = " . $_GET['action'] . ", is this a survey page? " . $this->isSurveyPage() . ", for proj " . $project_id);

        // Survey page
        if ($this->isSurveyPage()) {
            $this->emDebug("Survey page for project " . $project_id);
        } else if (!empty($project_id)) {
            $this->emDebug("Project page for project " . $project_id);
        } else {
            $this->emDebug("System page for project " . $project_id);
        }

    }

    /**
     * This function refreshes a users notifications and stores it in the cookie called redcapNotifications
     *
     * @param $user
     * @return void
     */
    public function refreshNotifications($user) {

        // Retrieve projects which hold the notifications and dismissals
        $notification_pid = $this->getSystemProjectIDs('notification-pid');
        $dismissal_pid = $this->getSystemProjectIDs('dismissal-pid');

        // Get current timestamp so we can pull notifications that are still open
        $new_timestamp = new DateTime();
        $now = $new_timestamp->format('Y-m-d H:i:s');

        // Find which projects this user is a member
        [$allProjectslists, $projAdminProjects] = $this->getAllProjectList($user, $now);

        // Retrieve list of projects that this person is a Designated Contact
        $dcProjects = $this->getDCProjectList($user);

        // Get list of notifications that have already been dismissed and should not be displayed again
        $dismissed = $this->getDismissedNotifications($dismissal_pid, $user);

        // Pull all system notifications
        $allNotifications['system'] = $this->getSystemNotifications($notification_pid, $now, $dcProjects, $projAdminProjects, $dismissed);

        // Pull all project level notifications
        $allNotifications['project'] = $this->getProjectNotifications($notification_pid, $now, $allProjectslists, $dcProjects, $projAdminProjects, $dismissed);

        // Store all the notifications in a session cookie
        $status = $this->sendCookie(json_encode($allNotifications));

    }

    /**
     * Not sure if this works to place notifications in browser cookie. TODO:Need to test.
     *
     * @param $cookieData
     * @return bool
     */
    private function sendCookie($cookieData) {

        $expireTime = 0;
        $cookiePath = '/'; // Cookie is available to entire domain
        $return = setcookie(self::COOKIE_NAME, $cookieData, $expireTime, $cookiePath);
        if ($return) {
            $this->emDebug("Set cookie successfully returned");
            $this->emDebug("This is the stored cookie: " . $_COOKIE[self::COOKIE_NAME]);
            return true;

        } else {
            $this->emDebug("Set Cookie was unsuccessful");
            return false;
        }
    }

    /**
     * Retrieves system setting in the EM config file for desired project.
     *
     * @return array
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

        $allProjList = array();
        $projAdminList = array();
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

        // Find projects that this user is the Designated Contact
        $dbReturn = $this->query(
            'select project_id
                    from designated_contact_selected
                    where contact_userid = ?', [$user]
        );

        while($row = $dbReturn->fetch_assoc()){
            $dcProjList[] = $row['project_id'];
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
     * @param $projAdminProjects
     * @param $dismissed
     * @return array
     */
    private function getSystemNotifications($notification_pid, $now, $dcProjects, $projAdminProjects, $dismissed) {

        // We are first pulling 'general' notifications that are not project dependant
        $filter = "([note_target] = 'gen') and ([note_start_dt] < '" . $now . "') and ([note_end_dt] > '" . $now . "') and " .
                    "[form_1_complete] = '2'";
        $this->emDebug("This is the system filter: " . $filter);

        // Retrieve notifications that fit the criteria
        $active_notifications = REDCap::getData($notification_pid, 'json', null, null, null, null, null, null, null, $filter);
        $this->emDebug("These are system notifications: " . $active_notifications);
        $sys_notifications = json_decode($active_notifications, true);

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

                    } else if ($notification['note_user_types'] = 'admin' and !empty($projAdminProjects)) {
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
     * @return array
     */
    private function getProjectNotifications($notification_pid, $now, $allProjectslists, $dcProjects, $projAdminProjects, $dismissed) {

        // Now check for project level notifications that are active and we are a member
        $filter = "([note_target] = 'proj') and ([note_start_dt] < '" . $now . "') and ([note_end_dt] > '" . $now . "') and " .
                    "[form_1_complete] = '2'";

        // Retrieve notifications that fit the criteria and we are on the project
        $active_notifications = REDCap::getData($notification_pid, 'json', null, null, null, null, null, null, null, $filter);
        $this->emDebug("Active Project Notifications: " . $active_notifications);
        $proj_notifications = json_decode($active_notifications, true);

        $projNotifications = array();
        $repeatMsg = array();
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

        $this->emDebug("Repeat message list: " . json_encode($repeatMsg));
        $this->emDebug("This is the final project notifications list: " . json_encode($projNotifications));

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

        $this->emDebug("Dismissed pid: " . $dismissal_pid . ", user: " . $user);
        $filter = "[note_username] = '" . $user . "'";
        $dismissed = REDCap::getData($dismissal_pid, 'json', null, null, null, null, null, null, null, $filter);
        $this->emDebug("Dismissed list: " . $dismissed);

        $dismissedNote = array();
        foreach($dismissed as $each_dismissed) {
            $dismissedNote[] = $dismissed['note_record_id'];
        }

        return $dismissedNote;
    }


}
