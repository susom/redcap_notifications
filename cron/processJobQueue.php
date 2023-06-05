<?php
namespace Stanford\RedcapNotifications;
/** @var \Stanford\RedcapNotifications\RedcapNotifications $module */

$return   = $module->processJobQueue();

echo "<pre>";
print_r($return);
