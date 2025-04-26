const pingTou = () => {
    const ping = fetch(process.env.TOU_URL + "/pingTest")
    console.log("Tou pinged")
}

module.exports = { pingTou }