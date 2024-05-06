<?php

namespace Stanford\RedcapNotifications;


use phpDocumentor\Reflection\Types\This;

require_once __DIR__ . '/../../../redcap_connect.php';

final class RedcapNotificationsTest extends \ExternalModules\ModuleBaseTest
{
    public function testCleanUser()
    {
        /** @var \Stanford\RedcapNotifications\RedcapNotifications $this */

        $expected = 'clean_user';
        $this->assertEquals($expected, $this->cleanUser('[clean user]'));
    }

    public function testExcludeProjects()
    {
        /** @var \Stanford\RedcapNotifications\RedcapNotifications $this */

        $expected = [1];
        $projects = [1, 2];
        $exclude = '2';
        $this->assertEquals(json_encode($expected), json_encode($this->excludeProjects($projects, $exclude)));
    }

    public function testThisProjectExcluded()
    {
        /** @var \Stanford\RedcapNotifications\RedcapNotifications $this */

        $expected = true;
        $this->assertEquals($expected, $this->thisProjectExcluded(1, '1'));
    }
}