<?php

namespace Stanford\RedcapNotifications;

use Predis\Client;

class Redis implements CacheInterface
{

    private Client $client;

    public function __construct($redisHost, $redisPort)
    {
        // TODO: Get Predis client here.
        $this->client = new \Predis\Client([
            'host' => $redisHost,
            'port' => $redisPort,
            'connections' => 'relay' //For performance improvements
        ]);

    }

    /**
     * Set key value pair
     * @param $key
     * @param $value
     * @return \Predis\Response\Status
     */
    public function setKey($key, $value)
    {
        return $this->client->set($key, $value);
    }

    /**
     * Given an array of key/value pairs, set cache
     * @param array $arr
     * @return mixed
     */
    public function setKeys(array $arr)
    {
        return $this->client->mset($arr);
    }

    /**
     * Get value for a given key
     * @param $key
     * @return string|null
     */
    public function getKey($key)
    {
        return $this->client->get($key);
    }

    /**
     * Given an array of keys, return all values
     * @param array $arr
     * @return array
     */
    public function getKeys(array $arr)
    {
        return $this->client->mget($arr);
    }

    public function deleteKey($key)
    {
        return $this->client->del($key);
        // TODO: Implement deleteKey() method.
    }

    public function expireKey($key)
    {
        // TODO: Implement expireKey() method.
    }
}
