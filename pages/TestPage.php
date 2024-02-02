<?php

// namespace Stanford\RedcapNotifications;
/** @var \Stanford\RedcapNotifications\RedcapNotifications $module*/

try {
//    Create new client
    $factory = new \Stanford\RedcapNotifications\CacheFactory();
    $client = $factory->getCacheClient('REDIS', 'redis', '6379');

    echo $client->getKey('test');

} catch (Exception $e) {
    echo "Exception : $e";
}
