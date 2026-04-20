package com.huynhtrankhanh.strippedplover

import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private val nodeStarted = AtomicBoolean(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        startNodeRuntimeIfNeeded()
    }

    private fun startNodeRuntimeIfNeeded() {
        if (!nodeStarted.compareAndSet(false, true)) {
            return
        }

        val runtimeDir = File(filesDir, "node-runtime").apply { mkdirs() }
        val nodeBinary = File(runtimeDir, "node")
        val entryScript = File(runtimeDir, "main.js")

        copyAssetToFile("node/bin/node", nodeBinary)
        copyAssetToFile("node/main.js", entryScript)

        if (!nodeBinary.setExecutable(true)) {
            Log.e(TAG, "Failed to mark Node binary as executable")
            return
        }

        try {
            val process = ProcessBuilder(nodeBinary.absolutePath, entryScript.absolutePath)
                .directory(runtimeDir)
                .redirectErrorStream(true)
                .start()

            thread(name = "node-log-reader") {
                process.inputStream.bufferedReader().useLines { lines ->
                    lines.forEach { Log.i(TAG, "[node] $it") }
                }
            }

            Log.i(TAG, "Node runtime started")
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to start Node runtime", t)
        }
    }

    private fun copyAssetToFile(assetPath: String, target: File) {
        assets.open(assetPath).use { input ->
            target.outputStream().use { output ->
                input.copyTo(output)
            }
        }
    }

    companion object {
        private const val TAG = "StrippedPloverIME"
    }
}
