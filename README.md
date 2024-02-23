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
| en | string | error message in english |
| fr | string | error message in french |
</details>


<details id="locationdata">
<summary> locationData </summary>

| Property | dataType | Optional |
| -------: | -------- | -------- |
| longitude | double | False |
| latitude | double | False |
| address | string | True |
</details>

<details id="recipientdata">
<summary> recipientDatas </summary>

> Note: unless `otherPhones` every properties are required

| Property | dataType | role |
| -------: | -------- | ---- |
| name | string | the name of the main recipient of the package |
| otherPhones | string[2] | the eventual alternative recipients phone number |
| phone | string | the main recipient phone number |

</details>

<details id="registrationdata">
<summary> registrationData </summary>

| Property | dataType | Optional | role |
| -------: | -------- | -------- | ---- |
| gender | [genderData](#enumerations) | True | driver's gender |
| lang | [languageData](#enumerations) | True | driver's preferred language |
| sponsorCode | string | True | code eventually given to the drive during registration |
| age | [ageData](#enumerations) | False | driver's age range |
| carInfos | File | False | a file containing all driver's car informations |
| email | string | False | driver's email |
| firstName | string | False | driver's firstname |
| lastName | string | False | driver's lastName |
| password | string | False | driver's initial password in the platform |
| phoneNumber | string | False | driver's phone number |
</details>

<details id="userdata-short">
<summary> shortUserData </summary>

| Property | dataType | role |
| --------: | -------- | ---- |
| avatar | string | link to the user's avatar |
| firstName | string | user's first name |
| lastName | string | user's last name |
| phone | string | user's phone number |
| id | string | user's indentifier |
</details>

<details id="userdata">
<summary> UserData </summary>

This model has every Property found in [shortUserData](#userdata-short) plus the following ones
> Note: only the avatar is optional in the `shortUserData` dataType

| Property | dataType | Optional | role |
| -------: | -------- | -------- | ---- |
| age | [ageData](#enumerations)  | True  | user's age |
| availabe | boolean  | True | flag used to tell if a driver is available |
| gender | [genderData](#enumerations)  | True | user's gender |
| position | [locationData](#locationdata)  | True | driver's current location |
| role | [userRole](#enumerations)  | False | user's role in the platform |
</details>

<details id="deliverydata">
<summary> deliveryData </ summary>

> Note: only the `note` and `end` properties are optional for this model

|Property | dataType | role |
| ------- | -------- | ---- |
| begin | Date | begining date of the delivery |
| departure | [locationData](#locationdata) | location of the delivery's departure |
| destination | [locationData](#locationdata) | location of the delivery's destination |
| end | Date | ending date of the delivery |
| id | string | the delivery indentifier |
| note | double | the rating of the delivery given by the client |
| packageType | string | the type of package |
| recipientInfos | [recipientDatas](#recipientdata) | the informations about the recipient of the package |
</details>

<details id="confilctdata">
<summary> confilctData </ summary>

> Note: only the `cancelationDate` property is optional for this model

|Property | dataType | role |
| ------- | -------- | ---- |
| cancelationDate | Date | cancelation date of the delivery |
| lastLocation | [locationData](#locationdata) | location of the driver while reporting the conflict |
| delivery | [deliveryData](#deliverydata) | informations about the conflicting delivery |
| date | Date | date when the conflict was reported |
| id | string | the conflict indentifier |
| status | string | the status of the conflict |
| type | string | the type of conflict |
| reporter | [UserData](#userdata) | informations about the conflict's reporter |
</details>

<details id="messagedata">
<summary> messageData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| content | string | content of the message |
| date | Date | date when the message was sent |
| id | string | message indentifier |
| room | an object having the following schema ```js { id: string, name: string } ``` | informations about the corresponding chat of the message |
| sender | [shortUserData](#userdata-short) | informations about the message's sender |
</details>

<details id="missedmessages">
<summary> missedMessageData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| count | number | total of unread messages |
| messages | [messageData[]](#messagedata) | unread messages |
| roomId | string | chat's indentifier|
| roomName | string | chat's name|
</details>

<details id="roomdata">
<summary> roomData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| id | string | the chat's indentifier |
| lastMessage | [messageData](#messagedata) | the last message sent in the chat |
| members | [shortUserData[]](#userdata-short) | list of the chat's members |
| name | string | the chat's name |
| delivery | an object having the following schema ```js { id: string, name: string } ``` | informations about the corresponding delivery of the chat |
</details>

<details id="conlicttype">
<summary> conflictTypeData </summary>

| Property | dataType | role |
| -------: | -------- | ---- |
| code | string | conflict's code in the platform |
| en | string | conflict name in english |
| fr | string | conflict name in french |
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
| search_radius | number | the radius to search a driver in second |
| ttl | number | the delay within which a driver can accept a delivery |
| conflict_types | [conflictTypeData[]](#conflicttype) | the type of conflicts supported by the platform |
| package_types | [conflictTypeData[]](#conflicttype) | the type of packages supported by the platform |
</details>
