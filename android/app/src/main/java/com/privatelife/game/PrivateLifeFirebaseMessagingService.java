package com.privatelife.game;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;

public class PrivateLifeFirebaseMessagingService extends FirebaseMessagingService {

    private static final String PREFS = "private_life_native";
    private static final String PREF_PUSH_TOKEN = "push_token";
    private static final String PREF_PENDING_PUSH = "pending_push";
    private static final String CHANNEL_ID = "private_life_events";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .putString(PREF_PUSH_TOKEN, token == null ? "" : token)
                .apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);

        Map<String, String> data = message.getData();
        String app = value(data, "app", "PRIVATE LIFE");
        String title = value(data, "title", app);
        String body = value(data, "body", "");
        String eventType = value(data, "eventType", "game_event");
        String eventId = value(data, "eventId", String.valueOf(System.currentTimeMillis()));

        JSONObject detail = new JSONObject();
        JSONObject extra = new JSONObject();
        try {
            detail.put("id", "native-" + eventType + "-" + eventId);
            detail.put("app", app);
            detail.put("title", title);
            detail.put("body", body);
            java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
            iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            detail.put("createdAt", iso.format(new java.util.Date()));
            detail.put("priority", "high");

            extra.put("eventType", eventType);
            extra.put("eventId", eventId);
            extra.put("route", value(data, "route", ""));

            String payload = value(data, "payload", "");
            if (!payload.isEmpty()) {
                try {
                    extra.put("payload", new JSONObject(payload));
                } catch (Exception ignored) {
                    extra.put("payload", payload);
                }
            }
            detail.put("data", extra);
        } catch (Exception ignored) {
        }

        storePending(detail);
        showSystemNotification(app, title, body, eventType, eventId);
    }

    private void storePending(JSONObject detail) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONArray next = new JSONArray();
        next.put(detail);

        try {
            JSONArray current = new JSONArray(prefs.getString(PREF_PENDING_PUSH, "[]"));
            for (int i = 0; i < current.length() && i < 49; i++) {
                next.put(current.get(i));
            }
        } catch (Exception ignored) {
        }

        prefs.edit().putString(PREF_PENDING_PUSH, next.toString()).apply();
    }

    private void showSystemNotification(
            String app,
            String title,
            String body,
            String eventType,
            String eventId
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("push_event_type", eventType);
        intent.putExtra("push_event_id", eventId);

        int requestCode = (eventType + ":" + eventId).hashCode();
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        builder.setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle(title)
                .setContentText(body.isEmpty() ? app : body)
                .setStyle(new Notification.BigTextStyle().bigText(body.isEmpty() ? app : body))
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setContentIntent(pendingIntent);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            int notificationId = requestCode == Integer.MIN_VALUE ? 1 : Math.abs(requestCode);
            manager.notify(notificationId, builder.build());
        }
    }

    private static String value(Map<String, String> data, String key, String fallback) {
        String value = data == null ? null : data.get(key);
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }
}
