'use strict';

var http = require('http');
var qs = require('querystring');
var parseXmlString = require('xml2js').parseString;

/**
 * We're not discovering our devices, we're just hardcoding them.  Easy!
 */
const USER_DEVICES = [
    {
        // This id needs to be unique across all devices discovered for a given manufacturer
        applianceId: 'marantz-sr5010-shield',
        // Company name that produces and sells the smart home device
        manufacturerName: 'Marantz nVidia',
        // Model name of the device
        modelName: 'SR5010 Shield',
        // Version number of the product
        version: '1.0',
        // The name given by the user in your application. Examples include 'Bedroom light' etc
        friendlyName: 'Shield',
        // Should describe the device type and the company/cloud provider.
        // This value will be shown in the Alexa app
        friendlyDescription: 'nVidia Shield via Marantz SR5010',
        // Boolean value to represent the status of the device at time of discovery
        isReachable: true,
        // List the actions the device can support from our API
        // The action should be the name of the actions listed here
        // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
        actions: ['turnOn', 'turnOff', 'incrementPercentage', 'decrementPercentage', 'setPercentage'],
        // not used at this time
        //additionalApplianceDetails: {
        //    extraDetail1: 'optionalDetailForSkillAdapterToReferenceThisDevice',
        //},
    },
    {
        applianceId: 'marantz-sr5010-cable',
        manufacturerName: 'Marantz Cable',
        modelName: 'SR5010 Cable',
        version: '1.0',
        friendlyName: 'Cable',
        friendlyDescription: 'Cable Box via Marantz SR5010',
        isReachable: true,
        actions: ['turnOn', 'turnOff', 'incrementPercentage', 'decrementPercentage', 'setPercentage'],
    },
    {
        applianceId: 'marantz-sr5010',
        manufacturerName: 'Marantz',
        modelName: 'SR5010',
        version: '1.0',
        friendlyName: 'Receiver',
        friendlyDescription: 'Marantz SR5010 Volume',
        isReachable: true,
        actions: ['turnOn', 'turnOff', 'incrementPercentage', 'decrementPercentage', 'setPercentage'],
    }
];

/**
 * Utility functions
 */

function log(title, msg) {
    console.log(`[${title}] ${msg}`);
}

/**
 * Generate a unique message ID
 *
 * https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
 * This isn't UUID V4 but it's good enough for what we're doing
 */
function generateMessageID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

/**
 * Generate a response message
 *
 * @param {string} name - Directive name
 * @param {Object} payload - Any special payload required for the response
 * @returns {Object} Response object
 */
function generateResponse(name, payload) {
    return {
        header: {
            messageId: generateMessageID(),
            name: name,
            namespace: 'Alexa.ConnectedHome.Control',
            payloadVersion: '2',
        },
        payload: payload,
    };
}

/**
 * This is a lot easier when I'm just hard-coding my devices
 */
function getDevicesFromPartnerCloud() {
    return USER_DEVICES;
}

function isValidToken() {
    /**
     * Always returns true for sample code.
     * You should update this method to your own access token validation.
     */
    return true;
}

/**
 * The meat and potatoes, I'm butchering just the things I Need from the solid work done by Nathan Totten:
 * https://github.com/ntotten/marantz-avr/blob/master/lib/avreciever.js
 */
 
function marantzAPI(commands, apiCallback) {
    var postData = {};
    
    // always add this guy
    commands.push('aspMainZone_WebUpdateStatus/');
    
    // format commands for the Marantz POST (cmd0: cmd1: etc)
    // note: may need to send commands one at a time??
    for (var i=0; i<commands.length; i++) {
        postData['cmd' + i] = commands[i];
    }
    
    log('DEBUG', `MarantzAPI Called w Data: ` + qs.stringify(postData));
    
    var serverError = function (e) {
        log('Error', e.message);
        apiCallback(false, e.message);
    };    
    
    var apiRequest = http.request({
        hostname: process.env.receiverIp,
        path: '/MainZone/index.put.asp',
        port: process.env.receiverPort,
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(qs.stringify(postData))
        },
    }, function(response) {
        
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            //log('DEBUG', 'CHUNK RECEIVED');
        });
        
        response.on('end', function () {
            log('DEBUG', `API Request Complete`);
            apiCallback(true, '');
        });        

        response.on('error', serverError); 
    });

    apiRequest.on('error', serverError);
    apiRequest.write(qs.stringify(postData));
    apiRequest.end();    
} 

function getReceiverState(statusCallback) {
    
    // get the receiver state
    http.get({
        hostname: process.env.receiverIp,
        path: '/goform/formMainZone_MainZoneXml.xml',
        port: process.env.receiverPort,
    }, function(statusResponse) {
        var xmlDoc;
        
        statusResponse.on('data', function(chunk){
            xmlDoc += chunk;
        });        
        
        statusResponse.on('end', function() {
            // we gotta trim the xmlDoc up a bit
            xmlDoc = xmlDoc.replace('undefined', '').trim();
            
            // parse our XML Document into json pls
            parseXmlString(xmlDoc, function(err, receiver) {
                if (err) {
                   statusCallback(false, generateResponse('DriverInternalError', {})); 
                }
                
                statusCallback(true, receiver);
            });
        });
    });
                    
}


/**
 * Main logic
 */

/**
 * This function is invoked when we receive a "Discovery" message from Alexa Smart Home Skill.
 * We are expected to respond back with a list of appliances that we have discovered for a given customer.
 *
 * @param {Object} request - The full request object from the Alexa smart home service. This represents a DiscoverAppliancesRequest.
 *     https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesrequest
 *
 * @param {function} callback - The callback object on which to succeed or fail the response.
 *     https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback
 *     If successful, return <DiscoverAppliancesResponse>.
 *     https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
 */
function handleDiscovery(request, callback) {
    log('DEBUG', `Discovery Request: ${JSON.stringify(request)}`);

    /**
     * Get the OAuth token from the request.
     */
    const userAccessToken = request.payload.accessToken.trim();

    /**
     * Generic stub for validating the token against your cloud service.
     * Replace isValidToken() function with your own validation.
     */
    if (!userAccessToken || !isValidToken(userAccessToken)) {
        const errorMessage = `Discovery Request [${request.header.messageId}] failed. Invalid access token: ${userAccessToken}`;
        log('ERROR', errorMessage);
        callback(new Error(errorMessage));
    }

    /**
     * Assume access token is valid at this point.
     * Retrieve list of devices from cloud based on token.
     *
     * For more information on a discovery response see
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
     */
    const response = {
        header: {
            messageId: generateMessageID(),
            name: 'DiscoverAppliancesResponse',
            namespace: 'Alexa.ConnectedHome.Discovery',
            payloadVersion: '2',
        },
        payload: {
            discoveredAppliances: getDevicesFromPartnerCloud(userAccessToken),
        },
    };

    /**
     * Log the response. These messages will be stored in CloudWatch.
     */
    log('DEBUG', `Discovery Response: ${JSON.stringify(response)}`);

    /**
     * Return result with successful message.
     */
    callback(null, response);
}

/**
 * A function to handle control events.
 * This is called when Alexa requests an action such as turning off an appliance.
 *
 * @param {Object} request - The full request object from the Alexa smart home service.
 * @param {function} callback - The callback object on which to succeed or fail the response.
 */
function handleControl(request, callback) {
    log('DEBUG', `Control Request: ${JSON.stringify(request)}`);

    const userAccessToken = request.payload.accessToken.trim();
    const applianceId = request.payload.appliance.applianceId;

    /**
     * If the applianceId is missing, return UnexpectedInformationReceivedError
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#unexpectedinformationreceivederror
     */
    if (!applianceId) {
        log('ERROR', 'No applianceId provided in request');
        const payload = { faultingParameter: `applianceId: ${applianceId}` };
        callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
        return;
    }

    let response;
    var commands = [];
    
    switch (request.header.name) {
        case 'TurnOnRequest':
            // turn on the device
            commands.push('PutZone_OnOff/ON');
            
            // set the input
            switch (applianceId) {
                case 'marantz-sr5010-shield':
                    commands.push('PutZone_InputFunction/MPLAY');
                    break;
                    
                case 'marantz-sr5010-cable':
                    commands.push('PutZone_InputFunction/SAT/CBL');
                    break;
                  
                case 'marantz-sr5010':
                    // no additional commands needed
                    break;
                                    
            }
 
            marantzAPI(commands, function(success, message) {
                if (success !== true) {
                    callback(null, generateResponse('DriverInternalError', {}));
                } 
                
                // and close us out.
                log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);
                callback(null, generateResponse('TurnOnConfirmation', {}));
            });
            break;

        case 'TurnOffRequest':
            commands.push('PutZone_OnOff/OFF');
            
            marantzAPI(commands, function(success, message) {
                if (success !== true) {
                    callback(null, generateResponse('DriverInternalError', {}));
                } 
                
                // and close us out.
                log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);
                callback(null, generateResponse('TurnOffConfirmation', {}));
            });
            break;
            
        case 'SetPercentageRequest': {
            const percentage = request.payload.percentageState.value;
            if (!percentage) {
                const payload = { faultingParameter: `percentageState: ${percentage}` };
                callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
                return;
            }
            
            // the receiver is set in increments less than 80.  So the highest we can go is -0
            // The lowest we can go is -80
            
            var newVolume = ((100-percentage)/100)*80;
            
            commands.push('PutMasterVolumeSet/-' + newVolume);

            marantzAPI(commands, function(success, message) {
                if (success !== true) {
                    callback(null, generateResponse('DriverInternalError', {}));
                } 
                
                // and close us out.
                log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);
                callback(null, generateResponse('SetPercentageConfirmation', {}));
            });
            break;
        }

        case 'IncrementPercentageRequest': {
            const delta = request.payload.deltaPercentage.value;
            if (!delta) {
                const payload = { faultingParameter: `deltaPercentage: ${delta}` };
                callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
                return;
            }
            
            getReceiverState(function(success, receiver) {
                if (success === false) {
                    callback(null, generateResponse('DriverInternalError', {}));
                }
                
                var masterVolume = Math.abs(receiver.item['MasterVolume'][0].value[0]);

                // volume++ means decreasing the value of MasterVolume
                var newVolume = Math.round(masterVolume-(delta/100)*80);

                // too loud! max us out
                if (newVolume < 0) { newVolume = 10; }
                
                // too quiet, let's get a bit of sound here
                if (newVolume > 80) { newVolume = 70; }
                
                commands.push('PutMasterVolumeSet/-' + newVolume);
                
                marantzAPI(commands, function(success, message) {
                    if (success === true) {
                        response = generateResponse('IncrementPercentageConfirmation', {});
                    } else {
                        response = generateResponse('DriverInternalError', {});
                    }
                    
                    // and close us out.
                    log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);
                    callback(null, response);
                });
            }); 

            break;
        }

        case 'DecrementPercentageRequest': {
            const delta = request.payload.deltaPercentage.value;
            if (!delta) {
                const payload = { faultingParameter: `deltaPercentage: ${delta}` };
                callback(null, generateResponse('UnexpectedInformationReceivedError', payload));
                return;
            }

            getReceiverState(function(success, receiver) {
                if (success === false) {
                    callback(null, generateResponse('DriverInternalError', {}));
                }
                
                var masterVolume = Math.abs(receiver.item['MasterVolume'][0].value[0]);
                
                // volume-- means a BIGGER value here.
                var newVolume = Math.round(masterVolume+(delta/100)*80);
                
                // too loud! max us out
                if (newVolume < 0) { newVolume = 10; }
                
                // too quiet, let's get a bit of sound here
                if (newVolume > 80) { newVolume = 70; }
                
                commands.push('PutMasterVolumeSet/-' + newVolume);
                
                marantzAPI(commands, function(success, message) {
                    if (success === true) {
                        response = generateResponse('DecrementPercentageConfirmation', {});
                    } else {
                        response = generateResponse('DriverInternalError', {});
                    }
                    
                    // and close us out.
                    log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);
                    callback(null, response);
                });
            }); 

            break;
        }
        

        default: {
            log('ERROR', `No supported directive name: ${request.header.name}`);
            callback(null, generateResponse('UnsupportedOperationError', {}));
            return;
        }
    }
    
    log('DEBUG', 'EOF handleControl');
    // I think I need to remove these, because response is not set at execution time
    // log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);
    // callback(null, response);
}

/**
 * Main entry point.
 * Incoming events from Alexa service through Smart Home API are all handled by this function.
 *
 * It is recommended to validate the request and response with Alexa Smart Home Skill API Validation package.
 *  https://github.com/alexa/alexa-smarthome-validation
 */
exports.handler = (request, context, callback) => {

    switch (request.header.namespace) {
        /**
         * The namespace of 'Alexa.ConnectedHome.Discovery' indicates a request is being made to the Lambda for
         * discovering all appliances associated with the customer's appliance cloud account.
         *
         * For more information on device discovery, please see
         *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discovery-messages
         */
        case 'Alexa.ConnectedHome.Discovery':
            handleDiscovery(request, callback);
            break;

        /**
         * The namespace of "Alexa.ConnectedHome.Control" indicates a request is being made to control devices such as
         * a dimmable or non-dimmable bulb. The full list of Control events sent to your lambda are described below.
         *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#payload
         */
        case 'Alexa.ConnectedHome.Control':
            handleControl(request, callback);
            break;

        /**
         * The namespace of "Alexa.ConnectedHome.Query" indicates a request is being made to query devices about
         * information like temperature or lock state. The full list of Query events sent to your lambda are described below.
         *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#payload
         *
         * TODO: In this sample, query handling is not implemented. Implement it to retrieve temperature or lock state.
         */
        // case 'Alexa.ConnectedHome.Query':
        //     handleQuery(request, callback);
        //     break;

        /**
         * Received an unexpected message
         */
        default: {
            const errorMessage = `No supported namespace: ${request.header.namespace}`;
            log('ERROR', errorMessage);
            callback(new Error(errorMessage));
        }
    }
};
