<?php

namespace Stanford\RedcapNotifications;

interface CacheInterface
{
    public function setKey($key, $value);

    public function setKeys(array $arr);

    public function getKey($key);

    public function getKeys(array $arr);

    public function deleteKey($key);

    public function expireKey($key);

}
