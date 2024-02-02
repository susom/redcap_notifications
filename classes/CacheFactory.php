<?php

namespace Stanford\RedcapNotifications;

class CacheFactory
{
    const REDIS = 'REDIS';

    const DATABASE = 'DATABASE';
    public static function getCacheClient($type, $host = '', $port = '')
    {
        if($type == self::REDIS and $port != '' and $host != ''){
            return new Redis($host, $port);
        }else{
            if($type == self::REDIS){
                \REDCap::logEvent('Redis host and/or port is missing!');
            }
            return new Database();
        }
    }
}