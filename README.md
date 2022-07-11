# REDCap Notifications
This EM will manage notifications displayed to REDCap users. These notifications may be project specific or generic
notifications.  If the notification is REDCap project specific, the notifications will only be displayed inside the
REDCap project.  If the notification is generic, it will be displayed on every REDCap page.

Users will have the ability to dismiss notifications so they are not displayed anymore and notifications
will have a lifecycle where they will expire after a certain amount of time (configurable in the EM System
Settings).

## Entity Tables
Three entity tables will be created to manage notifications. These entity tables are build using the
REDCap Entity EM.  The three tables are as follows:

1. <b>redcap_notifications</b> - This table holds all current and future notifications
2. <b>redcap_notifications_archive</b> - This table will hold all past notifications.  A cron job will run once a week to move expired notifications from the redcap_notifications.
3. <b>redcap_dismissed_notifications</b> - This table stores notifications dismissed by individual users so the notification is no longer displayed for that user

## How to create notifications
There are three paths to create notifications.  They are described below:
1. <b>EM Class</b> - The EM Notifications class can be used from other External Modules. This functionality is most useful when an EM occurs an error and wants project users aware of the error.
2. <b>EM System page</b> - This page, from the Control Panel, can be used to create notifications for system announcements.  For instance, notifications can be created when REDCap will be offline for upgrades, when new features are enabled, etc.
3. <b>API Endpoint</b> - This endpoint can be used by trusted outside processes which are allowed to notify REDCap users. Examples are automatted notifications when email servers go down, etc.

