package expo.modules.medianotification

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Foreground service hosting the app's single media session.
 *
 * Two jobs, and only two: keep Android from killing the process while audio
 * plays in the background, and give media3 a session to build the MediaStyle
 * notification from. The notification itself is media3's - `NotificationCompat`
 * is deliberately not used, because on Android 13+ the system rebuilds media
 * controls from the session regardless of what we post.
 *
 * The player is a [StubPlayer]; see that file for why it must stay audio-free.
 */
@UnstableApi
class MediaNotificationService : MediaSessionService() {

  private var mediaSession: MediaSession? = null
  private var stubPlayer: StubPlayer? = null

  override fun onCreate() {
    super.onCreate()

    val seed = MediaNotificationBridge.metadata
    val player = StubPlayer(
      initialTitle = seed.title,
      initialArtist = seed.artist,
      onPlayWhenReadyRequest = MediaNotificationBridge::emitTogglePlayPause,
      onStopRequest = MediaNotificationBridge::emitStop,
    )
    player.setMetadata(seed.title, seed.artist, seed.isPlaying)
    stubPlayer = player

    val session = MediaSession.Builder(this, player)
      .setId(SESSION_ID)
      .apply { sessionActivity()?.let(::setSessionActivity) }
      .build()
    mediaSession = session

    // media3 only registers a session with its notification manager when a
    // MediaController connects, and this app has no controller - the
    // notification *is* the product here, not a remote view of a player the
    // app also drives. Registering up front is what makes media3 post and
    // maintain the notification on its own.
    addSession(session)

    MediaNotificationBridge.attach(this)
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

  /** Main thread only. Called by the bridge when JS pushes new state. */
  fun applyMetadata() {
    val metadata = MediaNotificationBridge.metadata
    stubPlayer?.setMetadata(metadata.title, metadata.artist, metadata.isPlaying)
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // The notification controls audio produced by the JS runtime, which dies
    // with the task. Leaving it up would give the user buttons that do
    // nothing. Not delegating to super: its default keeps the service alive
    // while playback is "ongoing", and by this point ours cannot be.
    stopSelf()
  }

  override fun onDestroy() {
    MediaNotificationBridge.detach(this)
    mediaSession?.let { session ->
      removeSession(session)
      session.release()
    }
    stubPlayer?.release()
    mediaSession = null
    stubPlayer = null
    super.onDestroy()
  }

  /** Tapping the notification reopens the app rather than doing nothing. */
  private fun sessionActivity(): PendingIntent? {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private companion object {
    const val SESSION_ID = "moms-lifesaver"
  }
}
