package com.littleredbigstudio.app

import android.content.Context
import dev.ffmpegkit.llama.Llama
import dev.ffmpegkit.llama.LlamaConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Optional on-device Buddy brain.
 *
 * The model is deliberately downloaded on demand instead of bundled into the APK,
 * keeping the APK small. Once installed, chat can run without a network connection.
 */
object LocalBuddyBrain {
    const val MODEL_URL =
        "https://huggingface.co/bartowski/Qwen_Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf"
    const val MODEL_FILE = "buddy-qwen3.5-0.8b-q4_k_m.gguf"

    interface Callback {
        fun onResult(text: String)
        fun onError(message: String)
    }

    interface DownloadCallback {
        fun onProgress(percent: Int, downloaded: Long, total: Long)
        fun onComplete()
        fun onError(message: String)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var loadedModel: dev.ffmpegkit.llama.LlamaModel? = null
    private var loadedPath: String? = null

    fun modelFile(context: Context): File =
        File(File(context.filesDir, "models").apply { mkdirs() }, MODEL_FILE)

    fun isInstalled(context: Context): Boolean =
        modelFile(context).let { it.exists() && it.length() > 100_000_000L }

    fun download(context: Context, callback: DownloadCallback) {
        scope.launch(Dispatchers.IO) {
            val target = modelFile(context)
            val temp = File(target.parentFile, target.name + ".part")
            try {
                val connection = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20000
                    readTimeout = 60000
                    instanceFollowRedirects = true
                    requestMethod = "GET"
                }
                connection.connect()
                val code = connection.responseCode
                if (code !in 200..299) throw IllegalStateException("Model download failed (HTTP $code).")
                val total = connection.contentLengthLong
                var done = 0L
                connection.inputStream.use { input ->
                    FileOutputStream(temp).use { output ->
                        val buffer = ByteArray(1024 * 256)
                        var n: Int
                        while (input.read(buffer).also { n = it } >= 0) {
                            if (n == 0) continue
                            output.write(buffer, 0, n)
                            done += n
                            val percent = if (total > 0) ((done * 100L) / total).toInt().coerceIn(0, 100) else -1
                            callback.onProgress(percent, done, total)
                        }
                        output.fd.sync()
                    }
                }
                if (!temp.exists() || temp.length() < 100_000_000L) {
                    throw IllegalStateException("Downloaded GGUF file is incomplete.")
                }
                if (target.exists()) target.delete()
                if (!temp.renameTo(target)) throw IllegalStateException("Could not finalize the GGUF model.")
                callback.onComplete()
            } catch (e: Throwable) {
                try { temp.delete() } catch (_: Throwable) {}
                callback.onError(e.message ?: "Could not download the local Buddy model.")
            }
        }
    }

    fun chat(
        context: Context,
        prompt: String,
        systemPrompt: String,
        maxTokens: Int,
        callback: Callback,
    ) {
        scope.launch {
            var model = loadedModel
            try {
                val path = modelFile(context).absolutePath
                if (!isInstalled(context)) {
                    callback.onError("Local Buddy brain is not installed yet.")
                    return@launch
                }
                if (model == null || loadedPath != path) {
                    model?.let { Llama.releaseModel(it) }
                    model = Llama.loadModel(
                        modelPath = path,
                        config = LlamaConfig(
                            contextSize = 2048,
                            threads = 4,
                            gpuLayers = 0,
                            temperature = 0.7f,
                            topP = 0.9f,
                            topK = 40,
                        ),
                    )
                    loadedModel = model
                    loadedPath = path
                }
                val result = Llama.complete(
                    model = model,
                    prompt = prompt,
                    systemPrompt = systemPrompt,
                    maxTokens = maxTokens.coerceIn(32, 384),
                )
                val text = result.text.trim()
                if (text.isEmpty()) throw IllegalStateException("The local Buddy brain returned an empty response.")
                callback.onResult(text)
            } catch (e: Throwable) {
                callback.onError(e.message ?: "The local Buddy brain could not respond.")
            }
        }
    }

    fun release() {
        loadedModel?.let { Llama.releaseModel(it) }
        loadedModel = null
        loadedPath = null
    }
}
