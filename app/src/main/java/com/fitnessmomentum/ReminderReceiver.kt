package com.fitnessmomentum

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ReminderScheduler.ACTION_REMINDER_ALARM) {
            return
        }

        val time = intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_TIME) ?: return
        val snapshotJson = ReminderScheduler.getStoredSnapshot(context) ?: return
        val group = findGroup(snapshotJson, time) ?: return
        val lines = eligibleLines(group)

        if (lines.isNotEmpty() && canPostNotifications(context)) {
            showNotification(context, time, lines)
        }

        ReminderScheduler.scheduleFromStored(context)
    }

    private fun findGroup(snapshotJson: String, time: String): JSONObject? {
        return runCatching {
            val snapshot = JSONObject(snapshotJson)
            if (!snapshot.optBoolean("enabled", false)) {
                return@runCatching null
            }

            val groups = snapshot.optJSONArray("groups") ?: return@runCatching null
            for (index in 0 until groups.length()) {
                val group = groups.optJSONObject(index) ?: continue
                if (group.optString("time") == time) {
                    return@runCatching group
                }
            }
            null
        }.getOrNull()
    }

    private fun eligibleLines(group: JSONObject): List<String> {
        val items = group.optJSONArray("items") ?: JSONArray()
        val today = todayDate()
        val lines = mutableListOf<String>()

        for (index in 0 until items.length()) {
            val item = items.optJSONObject(index) ?: continue
            if (item.optBoolean("goalMet", false)) {
                continue
            }
            if (isSuppressedByFrequency(item, today)) {
                continue
            }

            val line = item.optString("line", "")
            if (line.isNotBlank()) {
                lines.add(line)
            }
        }

        return lines
    }

    private fun isSuppressedByFrequency(item: JSONObject, today: String): Boolean {
        val targetFrequency = item.optInt("targetFrequency", 1).coerceAtLeast(1)
        val lastLoggedAt = item.optString("lastLoggedAt", "").takeIf { it.isNotBlank() } ?: return false
        val lastDate = lastLoggedAt.take(10)
        if (!Regex("\\d{4}-\\d{2}-\\d{2}").matches(lastDate)) {
            return false
        }

        val days = daysBetween(lastDate, today) ?: return false
        return days > 0 && days < targetFrequency
    }

    private fun showNotification(context: Context, time: String, lines: List<String>) {
        ensureChannel(context)

        val launchIntent = Intent(context, MainActivity::class.java)
        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val title = if (lines.size == 1) "Exercise reminder" else "${lines.size} exercises to go"
        val body = lines.joinToString("\n")
        val notification = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(lines.first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        NotificationManagerCompat.from(context).notify(10_000 + abs(time.hashCode()), notification)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            ReminderScheduler.CHANNEL_ID,
            "Exercise reminders",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Reminders to complete your FitMo exercises"
        }

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }

        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun todayDate(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().time)
    }

    private fun daysBetween(start: String, end: String): Int? {
        return runCatching {
            val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
                timeZone = TimeZone.getDefault()
            }
            val startDate = formatter.parse(start) ?: return@runCatching null
            val endDate = formatter.parse(end) ?: return@runCatching null
            val millisPerDay = 24 * 60 * 60 * 1000L
            ((endDate.time - startDate.time) / millisPerDay).toInt().let { kotlin.math.abs(it) }
        }.getOrNull()
    }
}
