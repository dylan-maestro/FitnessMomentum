package com.fitnessmomentum

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.util.Calendar
import kotlin.math.abs

object ReminderScheduler {
    const val ACTION_REMINDER_ALARM = "com.fitnessmomentum.REMINDER_ALARM"
    const val EXTRA_REMINDER_TIME = "reminder_time"
    const val CHANNEL_ID = "fitness_momentum_reminders"
    private const val PREFS_NAME = "fitness_momentum_reminders"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_SCHEDULED_TIMES = "scheduled_times"

    fun saveSnapshot(context: Context, snapshotJson: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SNAPSHOT, snapshotJson)
            .apply()
    }

    fun getStoredSnapshot(context: Context): String? {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SNAPSHOT, null)
    }

    fun scheduleFromStored(context: Context) {
        val snapshot = getStoredSnapshot(context) ?: return
        scheduleFromSnapshot(context, snapshot)
    }

    fun scheduleFromSnapshot(context: Context, snapshotJson: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        cancelScheduledTimes(context, prefs.getStringSet(KEY_SCHEDULED_TIMES, emptySet()).orEmpty())

        val times = parseReminderTimes(snapshotJson)
        for (time in times) {
            scheduleTime(context, time)
        }

        prefs.edit()
            .putStringSet(KEY_SCHEDULED_TIMES, times)
            .apply()
    }

    private fun parseReminderTimes(snapshotJson: String): Set<String> {
        return runCatching {
            val snapshot = JSONObject(snapshotJson)
            if (!snapshot.optBoolean("enabled", false)) {
                return@runCatching emptySet<String>()
            }

            val groups = snapshot.optJSONArray("groups") ?: return@runCatching emptySet()
            buildSet {
                for (index in 0 until groups.length()) {
                    val group = groups.optJSONObject(index) ?: continue
                    val time = group.optString("time", "")
                    val items = group.optJSONArray("items")
                    if (time.matches(Regex("\\d{2}:\\d{2}")) && items != null && items.length() > 0) {
                        add(time)
                    }
                }
            }
        }.getOrDefault(emptySet())
    }

    private fun scheduleTime(context: Context, time: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pendingIntent = createPendingIntent(context, time)
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            nextTriggerAtMillis(time),
            pendingIntent
        )
    }

    private fun cancelScheduledTimes(context: Context, times: Set<String>) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (time in times) {
            alarmManager.cancel(createPendingIntent(context, time))
        }
    }

    private fun createPendingIntent(context: Context, time: String): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            action = ACTION_REMINDER_ALARM
            putExtra(EXTRA_REMINDER_TIME, time)
        }

        return PendingIntent.getBroadcast(
            context,
            abs(time.hashCode()),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun nextTriggerAtMillis(time: String): Long {
        val parts = time.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val calendar = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (calendar.timeInMillis <= System.currentTimeMillis()) {
            calendar.add(Calendar.DAY_OF_YEAR, 1)
        }

        return calendar.timeInMillis
    }
}
