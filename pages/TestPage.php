<?php

// namespace Stanford\RedcapNotifications;
/** @var \Stanford\RedcapNotifications\RedcapNotifications $module*/

try {
//    Create new client
    $redis = new \Predis\Client([
        'host' => 'redis'
    ]);
    $value = $redis->get('test');
    echo $value;
} catch (Exception $e) {
    echo "Exception : $e";
}
