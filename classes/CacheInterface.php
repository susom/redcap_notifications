<?php

namespace Stanford\RedcapNotifications;

interface CacheInterface
{
    public function setKey($key, $value);

    public function getKey($key);

    public function deleteKey($key);

    public function expireKey($key);

}