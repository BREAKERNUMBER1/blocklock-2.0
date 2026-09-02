/**
 * Discord webhook notifier — sends alerts to your Discord channel.
 * Set DISCORD_WEBHOOK_URL in .env to enable. Leave blank to disable.
 */

export async function notifyUnlock({ doorId, wallet, txHash, status }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return; // disabled

  const emoji = status === "unlocked" ? "🔓" : status === "tx_failed" ? "❌" : "⚠️";
  const color = status === "unlocked" ? 0x2ecc71 : status === "tx_failed" ? 0xe74c3c : 0xf39c12;

  const body = {
    embeds: [
      {
        title: `${emoji} BlockLock-LitVM — ${doorId}`,
        color,
        fields: [
          { name: "Status", value: status, inline: true },
          { name: "Door", value: doorId, inline: true },
          { name: "Wallet", value: `\`${wallet}\``, inline: false },
          txHash
            ? {
                name: "Transaction",
                value: `[View on LitVM Explorer](https://liteforge.explorer.caldera.xyz/tx/${txHash})`,
                inline: false,
              }
            : { name: "Transaction", value: "None submitted", inline: false },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "BlockLock Security System" },
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[Discord] Webhook failed:", res.status);
    }
  } catch (err) {
    console.error("[Discord] Notification error:", err.message);
  }
}
