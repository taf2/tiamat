module.exports = {
  server: require("tiamat/server.js").Tiamat,
  daemon: require("tiamat/daemon.js"),
  config: require("tiamat/config_loader.js").ConfigLoader
}
