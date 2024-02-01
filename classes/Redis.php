<?php

namespace Stanford\RedcapNotifications;

class Redis implements CacheInterface
{


    public function __construct()
    {
        // TODO: Get Predis client here.
    }

    public function setKey($key, $value)
    {
        // TODO: Implement setKey() method.
    }

    public function getKey($key)
    {
        // TODO: Implement getKey() method.
    }

    public function deleteKey($key)
    {
        // TODO: Implement deleteKey() method.
    }

    public function expireKey($key)
    {
        // TODO: Implement expireKey() method.
    }
}