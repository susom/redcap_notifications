<?php

namespace Stanford\RedcapNotifications;

class CacheFactory
{
    const REDIS = 'REDIS';

    const DATABASE = 'DATABASE';
    public static function getCacheClient($type)
    {
        switch ($type){
            case self::REDIS:
                return new Redis();
            case self::DATABASE:
                return new Database();
        }
    }
}