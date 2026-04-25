package com.fitnessmomentum

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.ActivityTestRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityTest {
    @get:Rule
    val activityRule = ActivityTestRule(MainActivity::class.java)

    @Test
    fun appContext_isCorrect() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("com.fitnessmomentum", appContext.packageName)
    }

    @Test
    fun mainActivity_loads() {
        val activity = activityRule.activity
        assertNotNull("MainActivity should not be null", activity)
        
        // Give WebView time to initialize
        Thread.sleep(1000)
        
        // Basic test - just verify activity is running
        assertTrue("Activity should be running", !activity.isFinishing)
    }
}

