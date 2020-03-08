const { Client } = require('../services/connection.js')
const { Command } = require('discord-akairo')
const { Gacha } = require('../services/gacha.js')
const { RichEmbed } = require('discord.js')

class GachaCommand extends Command {
    constructor(gala, season) {
        super('gacha', {
            aliases: ['gacha', 'g'],
            args: [
                {
                    id: 'operation',
                    type: 'string',
                    default: 'status'
                },
                {
                    id: 'gala',
                    type: 'string',
                    default: 'premium'
                },
                {
                    id: 'season',
                    type: 'string',
                    default: 'none'
                }
            ]
        })
    }

    async exec(message, args) {
        this.storeMessage(message)
        this.storeUser(message.author.id)
        await this.storeRateups()
        await this.storeSparkTarget()

        switch(args.operation) {
            case "yolo":
                this.yolo(message, args)
                break
            case "ten":
                this.ten_pull(message, args)
                break
            case "spark":
                this.spark(message, args)
                break
            case "rateup":
                this.rateup(message)
                break
            case "until":
                this.target(message, args)
                break
            case "help":
                this.help(message)
                break
            default:
                break
        }
    }

    // Command methods
    yolo(message, args) {
        let gacha = new Gacha(args.gala, args.season, this.rateups)
        let item = gacha.singleRoll()
        let response = this.responseString(item)

        message.reply(response)
    }

    ten_pull(message, args) {
        let gacha = new Gacha(args.gala, args.season, this.rateups)
        let items = gacha.tenPartRoll()
        var response = `You got these 10 things!\`\`\`html\n${this.multilineResponseString(items.items)}\n\`\`\``
        
        message.reply(response)
    }

    spark(message, args) {
        let gacha = new Gacha(args.gala, args.season, this.rateups)
        let items = gacha.spark()

        let embed = this.buildEmbed(items)
        message.channel.send(embed)
    }

    rateup(message, args) {
        let command = message.content.substring("$g rateup ".length).split(" ")[0]

        switch(command) {
            case "check":
                this.checkRateUp(message, args)
                break
            case "reset":
                this.resetRateUp()
                break
            case "set":
                this.setRateUp(command)
                break
            case "copy":
                this.copyRateUp(message)
                break
        }
    }

    async target(message) {        
        let splitMessage = message.content.split(" ")

        let properties = this.extractPropertiesFromTarget(splitMessage)
        let targetString = this.extractTarget(splitMessage, properties.gala, properties.season)

        let gacha = new Gacha(properties.gala, properties.season, this.rateups)
        let target = await this.fetchSuppliedTarget(targetString)

        if (this.checkTarget(gacha, target)) {
            var count = 0
            var found = false

            while (!found) {
                let roll = gacha.tenPartRoll()
                count = count + 10
                
                for (var i in roll.items) {
                    let item = roll.items[i]
                    if (item.name == target.name || (item.recruits == target.recruits && target.recruits != null)) {
                        found = true
                    }
                }
            }

            let string = this.generateTargetString(target, count)
            message.reply(string)
        } else {
            message.reply(`Sorry, **${target.name}** doesn't appear in the gala or season you selected.`)
        }
    }

    help(message) {
        var embed = new RichEmbed()

        var gachaOptions = [
            "```html\n",
            "<yolo>",
            "A single Premium Draw pull\n",
            "<ten>",
            "A 10-part Premium Draw pull\n",
            "<spark>",
            "A whole spark```\n",
            "<until>",
            "Roll until you get the item you want"
        ].join("\n")

        var galasAndSeasons = [
            "```html\n",
            "<gala: premium flash legend ff lf>",
            "The <gala> you choose will determine the SSR rate\n",
            "<season: valentine summer halloween holiday>",
            "The <season> you choose adds seasonal units to the pool```"
        ].join("\n")

        var usingRateups = [
            "```html\n",
            "<rateup set>",
            "Start a new rateup\n",
            "<rateup copy @user>",
            "Copy the tagged user's rateup\n",
            "<rateup check>",
            "Check your current rateup\n",
            "<rateup reset>",
            "Clear your current rateup```"
        ].join("\n")

        var settingRateups = [
            "```html\n",
            "<rateup set Sky Ace 0.300, Elil 0.500>",
            "Set rateups with the weapon or summon name followed by the desired rate",
            "You can add multiple rateups by separating them with a comma, as seen above.```"
        ].join("\n")

        embed.setTitle("Gacha")
        embed.setDescription("Welcome! I can help you save your money!")
        embed.setColor(0xdc322f)
        embed.addField("Command syntax", "```gacha spark <gala> <season>```")
        embed.addField("Gacha options", gachaOptions)
        embed.addField("Galas and Seasons", galasAndSeasons)
        embed.addField("Using Rateups", usingRateups)
        embed.addField("Setting Rateups", settingRateups)
        message.channel.send(embed)
    }

    // Rate-up command methods
    copyRateUp(message) {
        this.resetRateUp()

        let sourceUser = message.mentions.users.array()[0]
        let destinationUser = message.author
        let sql = [
            "INSERT INTO rateup (gacha_id, rate, user_id)",
            "SELECT gacha_id, rate, $1",
            "FROM rateup WHERE user_id = $2"
        ].join(" ")

        Client.any(sql, [destinationUser.id, sourceUser.id])
            .then(_ => {
                message.channel.send(`You successfully copied ${sourceUser}'s rate up!`)
            })
            .catch(error => {
                this.message.author.send(`Sorry, there was an error with your last request.`)
                console.log(error)
            })

    }

    checkRateUp(message) {
        let sql = [
            "SELECT rateup.gacha_id, rateup.rate, gacha.name, gacha.recruits",
            "FROM rateup LEFT JOIN gacha ON rateup.gacha_id = gacha.id",
            "WHERE rateup.user_id = $1",
            "ORDER BY rateup.rate DESC"
        ].join(" ")

        Client.any(sql, [message.author.id])
            .then(data => {
                if (data.length > 0) {
                    var rateUpDict = []
                    
                    for (var i = 0; i < data.length; i++) {
                        rateUpDict.push({
                            gacha_id : data[i].gacha_id,
                            name     : data[i].name,
                            rate     : data[i].rate,
                            recruits : data[i].recruits
                        })
                    }

                    let embed = this.generateRateUpString(rateUpDict)
                    message.channel.send(embed)
                } else {
                    message.reply("It looks like you don't have any rate-ups set right now. You can get started with `$g rateup copy @user` or `$g rateup set <rates>`.")
                }
            })
            .catch(error => {
                this.message.author.send(`Sorry, there was an error with your last request.`)
                console.log(error)
            })
    }

    setRateUp(command, message) {
        // First, clear the existing rate up
        this.resetRateUp(message)

        // Then, save the new rate up
        var rateups = this.extractRateUp(command)
        this.saveRateUps(rateups)
    }

    resetRateUp() {
        let sql = 'DELETE FROM rateup WHERE user_id = $1'
        Client.any(sql, [this.userId])
            .then(_ => {
                this.message.reply("Your rate-up has been cleared.")
            })
            .catch(error => {
                this.message.author.send(`Sorry, there was an error with your last request.`)
                console.log(error)
            })
    }

    // Rate-up helper methods
    saveRateUps(dictionary) {
        let list = dictionary.map(rateup => rateup.item)

        let sql = [
            "SELECT id, name, recruits",
            "FROM gacha WHERE name IN ($1:csv) OR recruits IN ($1:csv)"
        ].join(" ")
        
        Client.any(sql, [list])
            .then(data => {
                if (data.length > list.length) {
                    console.log("Data mismatch!")
                }

                let embed = this.createRateUpEmbed(data, dictionary, list)
                this.message.channel.send(embed)
            })
            .catch(error => {
                this.message.author.send(`Sorry, there was an error with your last request.`)
                console.log(error)
            })
    }

    createRateUpEmbed(data, dictionary, list) {
        var rateups = []
        for (var i in data) {
            // Fetch the rateup from the passed-in dictionary
            let rateup = this.joinRateUpData(data[i], dictionary)

            // Save the rate up data
            this.saveRateUp(rateup.id, rateup.rate)

            // Push to array
            rateups.push(rateup)
        }

        // Fetch the data for missing rate-ups
        // These will be items that don't exist in the game or typos
        let missing = this.findMissingRateUpData(list, data)

        // Create the embed displaying rate-up data
        let embed = this.generateRateUpString(rateups)

        if (missing.length > 0) {
            embed.addField('The following items could not be found and were not added to your rateup',  `\`\`\`${missing.join("\n")}\`\`\``)
        }

        return embed
    }

    saveRateUp(id, rate) {
        let sql = 'INSERT INTO rateup (gacha_id, user_id, rate) VALUES ($1, $2, $3)'
        Client.query(sql, [id, this.userId, rate])
            .catch(error => {
                this.message.author.send(`Sorry, there was an error with your last request.`)
                console.log(error)
            })
    }

    joinRateUpData(dict1, dict2) {
        var rateup = {
            id       : dict1.id,
            name     : dict1.name,
            recruits : dict1.recruits
        }

        for (var i in dict2) {
            let entry = dict2[i]

            if (entry.item == rateup.name || entry.item == rateup.recruits) {
                rateup.rate = entry.rate
            }
        }

        return rateup
    }

    findMissingRateUpData(original, result) {
        let resultNames = result.map(result => result.name)
        let resultRecruits = result.map(result => result.recruits)
            
        return original.filter(e => !resultNames.includes(e) && !resultRecruits.includes(e))
    }

    generateRateUpString(rateups) {
        var string = ""
        for (var i in rateups) {
            let rateup = rateups[i]

            if (rateup.recruits != null) {
                string += `${rateup.name} - ${rateup.recruits}: ${rateup.rate}%\n`
            } else {
                string += `${rateup.name}: ${rateup.rate}%\n`
            }
        }

        var embed = new RichEmbed()
        embed.setColor(0xb58900)
        embed.setTitle("Your current rate-up")
        embed.setDescription("```html\n" + string + "\n```")
        embed.setFooter(`These rate ups will only take effect on your gacha simulations.`)

        return embed
    }

    extractRateUp() {
        let rateupString = this.message.content.split(" ").splice(3).join(" ")
        let rawRateUps = rateupString.split(",").map(item => item.trim())

        var rateups = []
        for (var i in rawRateUps) {
            let splitRateup = rawRateUps[i].split(" ")

            rateups.push({
                rate : splitRateup.pop(),
                item : splitRateup.join(" ")
            })
        }

        return rateups
    }

    // Target command methods
    checkTarget(gacha, item) {
        if (gacha.gala == null && gacha.season == null && (gacha.isLimited(item) || gacha.isSeasonal(item))) {
            return false
        }

        if (gacha.gala != null && gacha.season == null && item[gacha.gala] == 0) {
            return false
        }

        if (gacha.season != null && gacha.gala == null && item[gacha.season] == 0) {
            return false
        }

        if (gacha.gala != null && gacha.season != null && item[gacha.gala] == 0 && item[gacha.season] == 0) {
            return false
        }

        return true
    }

    extractPropertiesFromTarget(message) {
        let gala = message.find(item => ["legend", "flash", "lf", "ff"].includes(item))
        let season = message.find(item => ["halloween", "holiday", "summer", "valentine"].includes(item))

        return {
            gala   : gala,
            season : season
        }
    }

    extractTarget(message, gala, season) {
        let indexOfGala = message.indexOf(gala)
        let indexOfSeason = message.indexOf(season)
        
        var target
        if (indexOfGala > -1) {
            target = message.splice(2, indexOfGala - 2).join(" ")
        } else if (indexOfGala == -1 && indexOfSeason > -1) {
            target = message.splice(2, indexOfSeason - 2).join(" ")
        } else {
            target = message.splice(2).join(" ")
        }

        return target
    }

    async fetchSuppliedTarget(name) {
        let sql = "SELECT * FROM gacha WHERE name = $1 OR recruits = $1"
        return await Client.one(sql, [name])
            .then(res => {
                return res
            })
            .catch(error => {
                this.message.author.send(`Sorry, there was an error with your last request.`)
                console.log(error)
            })
    }

    // Target helper methods
    generateTargetString(target, rolls) {
        var string = ""
        if (target.recruits != null) {
            string = `It took **${rolls.toLocaleString()} rolls** to pull **${target.name} (${target.recruits})**.`
        } else {
            string = `It took **${rolls.toLocaleString()} rolls** to pull **${target.name}**.`
        }

        let numTenPulls = rolls / 10
        let tenPullCost = 3000
        let exchangeRate = 106.10
        let conversion = `That's **${(numTenPulls * tenPullCost).toLocaleString()} crystals** or about **\$${Math.ceil(((numTenPulls * tenPullCost) / exchangeRate)).toLocaleString()}**!`
        
        return [string, conversion].join(" ")
    }

    // Filter methods
    filterSSRWeapons(el) {
        return el.rarity == 3 && el.item_type == 0
    }
    
    filterSSRSummons(el) {
        return el.rarity == 3 && el.item_type == 1
    }
    
    filterRateUpItems(items) {
        var totalCount = 0
        var rateups = this.rateups

        for (var i in rateups) {
            let rateupItem = this.rateups[i]
            totalCount += items.reduce(function (n, item) {
                return n + (rateupItem.gacha_id == item.gacha_id)
            }, 0)
        }

        return totalCount
    }

    // Render methods
    sortCharacterWeapons(results) {
        var characterWeapons = []
    
        for (var item in results) {
            var hasPlacedSR = false
            var lastSRPos = 0
            var placedSSRCount = 0
    
            if (results[item].recruits != null) {
                // If you get an R, put it at the front of the list
                if (results[item].rarity == 1) {
                    characterWeapons.unshift(results[item])
    
                    if (!hasPlacedSR) {
                        lastSRPos = characterWeapons.length
                    }
                }
    
                // If you get an SR, put it at the last SR position and record a new position
                if (results[item].rarity == 2) {
                    characterWeapons.splice(lastSRPos, 0, results[item])
    
                    if (!hasPlacedSR) {
                        hasPlacedSR = true
                    }
                }
    
                // If you get an SSR, put it at the end of the list
                if (results[item].rarity == 3) {
                    characterWeapons.push(results[item])
    
                    if (!hasPlacedSR) {
                        placedSSRCount += 1
                        lastSRPos = characterWeapons.length - placedSSRCount
                    }
                }
            }
        }
    
        return characterWeapons
    }

    responseString(result, combined = false) {
        var response = ""
    
        var rarityString = ""
        if (result.rarity == 1) {
            rarityString = "R"
        } else if (result.rarity == 2) {
            rarityString = "SR"
        } else if (result.rarity == 3) {
            rarityString = "SSR"
        }
    
        if (result.recruits != null) {
            var response = response + `<${rarityString}> ${result.name} – You recruited ${result.recruits.trim()}!`
        } else {
            if (result.item_type == 0) {
                var response = response + `<${rarityString}> ${result.name}`
            } else {
                var response = response + `<${rarityString} Summon> ${result.name}`
            }
        }
    
        if (!combined) {
            response = `\`\`\`html\n${response}\n\`\`\``
        } else {
            response = `${response}\n`
        }
    
        return response
    }
    
    multilineResponseString(results) {
        let characterWeapons = this.sortCharacterWeapons(results)
        var gachaItems = results.filter(x => !characterWeapons.includes(x)).concat(characterWeapons.filter(x => !results.includes(x)))
    
        let items = this.shuffle(gachaItems).concat(characterWeapons)
    
        var string = ""
        for (var item in items) {
            string += this.responseString(items[item], true)
        }
    
        return string
    }

    buildEmbed(results) {
        var embed = new RichEmbed()
        embed.setColor(0xb58900)

        var response = ""
        for (var i in results.items) {
            response += this.responseString(results.items[i], true)
        }
            
        let rate = Math.floor((results.count.SSR / 300) * 100)
            
        embed.setDescription("```html\n" + response + "\n```")
        embed.addField("Summary", `\`\`\`${this.summaryString(results.items, results.count)}\`\`\``)
        embed.setFooter(`Your SSR rate is ${rate}%`)

        return embed
    }
    
    summaryString(results, count) {
        let ssrWeapons = results.filter(this.filterSSRWeapons)
        let ssrSummons = results.filter(this.filterSSRSummons)
        let numRateupItems = this.filterRateUpItems(results)
        let targetAcquired = results.filter(item => { 
            if (this.sparkTarget != null) {
                return item.name === this.sparkTarget.name || (item.recruits != null && item.recruits === this.sparkTarget.recruits)
            } else {
                return null
            }
        })

        var targetAcquiredString = ""
        if (targetAcquired != null) {
            targetAcquired = (targetAcquired.length > 0) ? `You got your spark target! (${targetAcquired.length})` : ""
        }
        
        var ssrWeaponString = `SSR Weapons: ${ssrWeapons.length}`
        var ssrSummonString = `SSR Summons: ${ssrSummons.length}`
        var rateupString = (this.rateups.length > 0) ? `Rate-up Items: ${numRateupItems}` : ""
        var srString = `SR: ${count.SR}`
        var rString = `R: ${count.R}`
    
        return [targetAcquiredString, rateupString, ssrWeaponString, ssrSummonString, srString, rString].join("\n")
    }

    // Helper methods
    // https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
    shuffle(array) {
        var currentIndex = array.length, temporaryValue, randomIndex
      
        // While there remain elements to shuffle...
        while (0 !== currentIndex) {
      
          // Pick a remaining element...
          randomIndex = Math.floor(Math.random() * currentIndex)
          currentIndex -= 1
      
          // And swap it with the current element.
          temporaryValue = array[currentIndex]
          array[currentIndex] = array[randomIndex]
          array[randomIndex] = temporaryValue
        }
      
        return array
    }

    storeMessage(message) {
        this.message = message
    }

    storeUser(id) {
        this.userId = id
    }

    async storeRateups() {
        let sql = 'SELECT rateup.gacha_id, rateup.rate, gacha.name, gacha.recruits, gacha.rarity, gacha.item_type, gacha.premium, gacha.legend, gacha.flash, gacha.halloween, gacha.holiday, gacha.summer, gacha.valentine FROM rateup LEFT JOIN gacha ON rateup.gacha_id = gacha.id WHERE rateup.user_id = $1 ORDER BY rateup.rate DESC'

        try {
            this.rateups = await Client.any(sql, [this.userId])
        } catch {
            console.log("Error")
        }
    }

    async storeSparkTarget() {
        let sql = [
            "SELECT gacha.* FROM sparks",
            "LEFT JOIN gacha ON sparks.target_id = gacha.id",
            "WHERE user_id = $1"
        ].join(" ")

        try {
            let result = await Client.query(sql, [this.userId])
            this.sparkTarget = result[0]
        } catch {
            this.message.author.send(`Sorry, there was an error with your last request.`)
            console.log("Error")
        }
    }
}

module.exports = GachaCommand