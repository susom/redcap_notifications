<?php

namespace Stanford\RedcapNotifications;

use PhpParser\Node\Expr\Cast\Object_;

require_once "SimpleEmLogObject.php";


/**
 * New AJAX Requests will be appended to a queue that will be processed every 30 seconds (CRON)
 *
 */
class ProcessQueue extends SimpleEmLogObject
{
    /** @var RedcapNotifications $this->module */

    /**
     * The object holds QUEUED PROCESSING REQUESTS in the EM LOG TABLE
     * EM LOG table already has: record, timestamp
     */

    CONST OBJECT_NAME = 'QueuedJob';   // This is the 'name' of the object and stored in the message column


    public function __construct($module, $type = self::OBJECT_NAME, $log_id = null, $limit_params = [])
    {
        parent::__construct($module, $type, $log_id, $limit_params);
    }


    /**
     * Get The PROCESSED PAYLOAD (IF DONE)
     * @param $module obj
     * @return array
     */
    public static function getUnProcessedJobs($module) {
        $jobq           = ProcessQueue::getJobQueue($module);
        $jobs_in_q      = $jobq->getObjectParameters();

        $unprocessed    = array_filter($jobs_in_q, function ($item, $key) {
            // Skip 'record_id'
            if ($key === 'record_id') return false;

            // Decode the JSON
            $data = json_decode($item, true);

            // Check for 'results' key
            return !isset($data['results']);
        }, ARRAY_FILTER_USE_BOTH);

        return $unprocessed;
    }


    /**
     * Create an instance of this ProcessQueue
     * @return obj
     */
    public static function createJobQueue($module){
        return new ProcessQueue($module);
    }


    /**
     * Get existing or new Job QUeue
     * @param $module obj
     * @return obj
     */
    public static function getJobQueue($module) {
        //first check if existing jobQueue
        $jobQueue = self::queryObjects($module, self::OBJECT_NAME);
        if(empty($jobQueue)){
            $jobQueue = ProcessQueue::createJobQueue($module);
            $jobQueue->save();
        }else{
            $jobQueue = current($jobQueue);
        }

        return $jobQueue;
    }

}
