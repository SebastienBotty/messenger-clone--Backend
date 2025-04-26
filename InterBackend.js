const pingTou = async () => {
    try {
        const response = await fetch(process.env.TOU_URL + "/pingTest", {
            timeout: 5000,  // 5 secondes de timeout
            headers: {
                'Accept': 'application/json'
            }
        });
        console.log("Tou pinged successfully");

        if (!response.ok) {
            throw new Error("Error ping Tou")
        }
        console.log('Ping Ok')
    } catch (error) {
        console.error("Erreur lors du ping:", error.message);
    }
}


module.exports = { pingTou }