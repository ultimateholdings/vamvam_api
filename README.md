# Vamvam API documentation
The Vamvam API enables user to order deliveries in realtime so in order to use it there some specificity to understand

## Data Model

The model here represent the data used by the API to exchange informations with the components and users
> Note: throughout the documentation the `type[n]` notation is used to designate an array of `type` with at most n elements.
 If n is not specified it means that there is no restriction on the array's size

<details id="enumerations">
<summary> Enumerations </summary>

| Name | values |
| ------:| ------- |
| ageData | 18-24, 25-34, 35-44, 45-54, 55-64, 64+ |
| languageData | "en", "fr" |
| genderData | "F", "M" |
| AdminType | "registration", "conflict" |
| userRole |  "driver", "client", "admin", "conflict-manager", "registration-manager" |
</details>

<details id="errordata">
<summary> errorData </summary>

| Property | dataType | role |
| -------: | -------- | -------- |
| en | `String` | error message in english |
| fr | `String` | error message in french |
</details>


<details id="locationdata">
<summary> locationData </summary>

| Property | dataType | Optional |
| -------: | -------- | -------- |
| longitude | `Double` | False |
| latitude | `Double` | False |
| address | `String` | True |
</details>

<details id="recipientdata">
<summary> recipientDatas </summary>

> Note: unless `otherPhones` every properties are required

| Property | dataType | role |
| -------: | -------- | ---- |
| name | `String` | the name of the main recipient of the package |
| otherPhones | string[2] | the eventual alternative recipients phone number |
| phone | `String` | the main recipient phone number |

</details>

<details id="registrationdata">
<summary> registrationData </summary>

| Property | dataType | Optional | role |
| -------: | -------- | -------- | ---- |
| gender | [genderData](#enumerations) | True | driver's gender |
| lang | [languageData](#enumerations) | True | driver's preferred language |
| sponsorCode | `String` | True | code eventually given to the drive during registration |
| age | [ageData](#enumerations) | False | driver's age range |
| carInfos | File | False | a file containing all driver's car informations |
| email | `String` | False | driver's email |
| firstName | `String` | False | driver's firstname |
| lastName | `String` | False | driver's lastName |
| password | `String` | False | driver's initial password in the platform |
| phoneNumber | `String` | False | driver's phone number |
</details>

<details id="sponsordata">
<summary> sponsorData </ summary>

**Properties**

| Property | dataType | role |
| -------- | -------- | ---- |
| sponsor | <table> <thead><tr> <th> </th> Property <th> dataType </th></tr></thead> <tbody> <tr> <td> id </td> <td> `String` </td></tr> <tr> <td> code </td> <td> `String` </td></tr> <tr> <td> name </td> <td> `String` </td></tr> <tr> <td> phone </td> <td> `String` </td></tr> </tbody></table> | informations about a sponsor |
| sponsored | `Number` | number of users registered by this sponsor |

</details>

<details id="userdata-short">
<summary> shortUserData </summary>

| Property | dataType | role |
| --------: | -------- | ---- |
| avatar | `String` | link to the user's avatar |
| firstName | `String` | user's first name |
| lastName | `String` | user's last name |
| phone | `String` | user's phone number |
| id | `String` | user's indentifier |
</details>

<details id="userdata">
<summary> UserData </summary>

This model has every Property found in [shortUserData](#userdata-short) plus the following ones

> Note: only the avatar is optional in the `shortUserData` dataType

| Property | dataType | Optional | role |
| -------: | -------- | -------- | ---- |
| age | [ageData](#enumerations)  | True  | user's age |
| available | boolean  | True | flag used to tell if a driver is available |
| gender | [genderData](#enumerations)  | True | user's gender |
| position | [locationData](#locationdata)  | True | driver's current location |
| role | [userRole](#enumerations)  | False | user's role in the platform |

</details>

<details id="deliverydata">
<summary> deliveryData </ summary>

> Note: only the `note` and `end` properties are optional for this model

|Property | dataType | role |
| ------- | -------- | ---- |
| begin | `Date` | begining date of the delivery |
| departure | [locationData](#locationdata) | location of the delivery's departure |
| destination | [locationData](#locationdata) | location of the delivery's destination |
| end | `Date` | ending date of the delivery |
| id | `String` | the delivery indentifier |
| note | `Double` | the rating of the delivery given by the client |
| packageType | `String` | the type of package |
| recipientInfos | [recipientDatas](#recipientdata) | the informations about the recipient of the package |

</details>

<details id="confilctdata">
<summary> confilctData </ summary>

> Note: only the `cancelationDate` property is optional for this model

|Property | dataType | role |
| ------- | -------- | ---- |
| cancelationDate | `Date` | cancelation date of the delivery |
| lastLocation | [locationData](#locationdata) | location of the driver while reporting the conflict |
| delivery | [deliveryData](#deliverydata) | informations about the conflicting delivery |
| date | `Date` | date when the conflict was reported |
| id | `String` | the conflict indentifier |
| status | `String` | the status of the conflict |
| type | `String` | the type of conflict |
| reporter | [UserData](#userdata) | informations about the conflict's reporter |

</details>

<details id="messagedata">
<summary> messageData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| content | `String` | content of the message |
| date | `Date` | date when the message was sent |
| id | `String` | message indentifier |
| room | an object having the following schema ```js { id: string, name: string } ``` | informations about the corresponding chat of the message |
| sender | [shortUserData](#userdata-short) | informations about the message's sender |
</details>

<details id="missedmessages">
<summary> missedMessageData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| count | `Number` | total of unread messages |
| messages | [messageData[]](#messagedata) | unread messages |
| roomId | `String` | chat's indentifier|
| roomName | `String` | chat's name|
</details>

<details id="roomdata">
<summary> roomData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| id | `String` | the chat's indentifier |
| lastMessage | [messageData](#messagedata) | the last message sent in the chat |
| members | [shortUserData[]](#userdata-short) | list of the chat's members |
| name | `String` | the chat's name |
| delivery | an object having the following schema ```js { id: string, name: string } ``` | informations about the corresponding delivery of the chat |
</details>

<details id="conflicttype">
<summary> conflictTypeData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| code | `String` | conflict's code in the platform |
| en | `String` | conflict name in english |
| fr | `String` | conflict name in french |

</details>

<details id="settings">
<summary> SettingsData </summary>

A SettingsData is an object having two properties `type` and `value` representing respectively the type and the value of a setting.

The `type` property is always a **string** and the `value` is always and **Object** and the available settings are:

#### OTPSettingsData

- type: "otp"
- value: an object having the schema `{ ttl: number }` with ttl the time-to-leave of the OTP authentication

#### DeliverySettingsData
- type: "delivery"
- value: an object described bellow

| Property | dataType | role |
| -------: | -------- | ---- |
| search_radius | `Number` | the radius to search a driver in second |
| ttl | `Number` | the delay within which a driver can accept a delivery |
| conflict_types | [conflictTypeData[]](#conflicttype) | the type of conflicts supported by the platform |
| package_types | [conflictTypeData[]](#conflicttype) | the type of packages supported by the platform |

</details>

<details id="logindata">
<summary> LoginData </summary>

#### loginBody

|Property | dataType |
| ------- | -------- |
| phoneNumber | `String` |
| password | `String` |

#### loginResponse

|Property | dataType | role |
| ------- | -------- | ---- |
| message | [errorData](#errordata) | message sent by the server on unsuccessfull login attempt |
| token | `String` | the user access token in the platform |

</details>

## Authentication API
The purpose of this API is to grant users access to the platform so the following actions are available
It is also important to note that all the actions of this API are invocked through `POST` requests

### Register a new driver
**Endpoint** `/driver/register`
**Body Params** [registrationData](#registrationdata)
**Response**
- registered: `Boolean`
- message: [errorData](#errordata)


### Log in as an administrator
**Endpoint** `/auth/admin/login`
**Body Params** [loginBody](#logindata)
**Response** [loginResponse](#logindata)

### Log in as a client
**Endpoint** `/auth/client/login`
**Body Params** [loginBody](#logindata)
**Response** [loginResponse](#logindata)


### Log in as a driver
**Endpoint** `/auth/driver/login`
**Body Params** [loginBody](#logindata)
**Response** [loginResponse](#logindata)

### Request For a One Time Password to create a client user
**Endpoint** `/auth/send-otp`
**Body Params**

|Property | dataType | role |
| ------- | -------- | ---- |
| phoneNumber | `String` | the phone number to which the otp will be sent (in international format) |
| signature | `String` | the signature of the message to be sent (mostly used for auto-verification) |

**Response**

|Property | dataType | role |
| ------- | -------- | ---- |
| sent | `Boolean` | flag to tell if the message was sent |
| ttl | `String` | the delay(in seconds) after which the received message will be invalid |


### Verify a sent One Time Password

> Note: this action has as effect the creation of a new client user in the platform

**Endpoint** `/auth/verify-otp`
**Body Params**

|Property | dataType | role |
| ------- | -------- | ---- |
| phoneNumber | `String` | the phone number to which the otp was sent (in international format) |
| code | `String` | the received code |

**Response**

|Property | dataType | role |
| ------- | -------- | ---- |
| valid | `Boolean` | flag to tell if the sent code is valid |
| userExists | `Boolean` | flag to tell if a user with the `phoneNumber` exists in the platform |
| token | `String` | the access token to be used by the newly created user |


### Request a One Time Password for resetting an account's password

**Endpoint** `/auth/send-reset-otp`

**Body Params**
Same as [Request a One Time Password to create a client user](#request-a-one-time-password-to-create-a-client-user)

**Response**
Same as [Request a One Time Password to create a client user](#request-a-one-time-password-to-create-a-client-user)


### Verify the One Time Password for resetting an account's password

**Endpoint** `/auth/verify-reset`

**Body Params**
Same as [Verify a sent One Time Password](#verify-a-sent-one-time-password)

**Response**

|Property | dataType | role |
| ------- | -------- | ---- |
| message | [errorData](#errordata) | error message sent |
| resetToken | `String` | the access token to be used by when resetting the password |


### Reset an account password

**Endpoint** `/auth/reset-password`

**Body Params**

|Property | dataType | role |
| ------- | -------- | ---- |
| key | `String` | the `resetToken` returned when verifying the otp |
| password | `String` | the account's new password |

**Response**

|Property | dataType | role |
| ------- | -------- | ---- |
| message | [errorData](#errordata) | error message sent |
| updated | `Boolean` | a flag to tell if the password has been updated |



