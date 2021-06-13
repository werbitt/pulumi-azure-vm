import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
//import * as storage from "@pulumi/azure-native/storage";
import * as compute from "@pulumi/azure-native/compute"
import * as network from "@pulumi/azure-native/network"

// Get the username and password for the vm from the pulumi config
const config = new pulumi.Config();
const username = config.require("username");
const password = config.requireSecret("password");

// Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup("resourceGroup");

// Create a network and subnet
const virtualNetwork = new network.VirtualNetwork("network", {
  resourceGroupName: resourceGroup.name,
  addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
  subnets: [
    { 
      name: "default",
      addressPrefix: "10.0.2.0/24",
    }
  ]
});

// Allocate a public IP and assign to NIC
const publicIp = new network.PublicIPAddress("ip", {
  resourceGroupName: resourceGroup.name,
  publicIPAllocationMethod: network.IPAllocationMethod.Dynamic,
});

const networkInterface = new network.NetworkInterface("nic", {
  resourceGroupName: resourceGroup.name,
  ipConfigurations: [{
    name: "ipcfg",
    subnet: { id: virtualNetwork.subnets[0].id },
    privateIPAllocationMethod: network.IPAllocationMethod.Dynamic,
    publicIPAddress: { id: publicIp.id },
  }],
});

// const initScript = `#!/bin/bash\n
// echo "Hello, World!" > index.html
// nohub python -m SimpleHTTPServer 80 &`;

const vm = new compute.VirtualMachine("vm", {
  resourceGroupName: resourceGroup.name,
  networkProfile: {
    networkInterfaces: [{ id: networkInterface.id }],
  },
  hardwareProfile: {
    vmSize: compute.VirtualMachineSizeTypes.Standard_A0,
  },
  osProfile: {
    computerName: "mercury",
    adminUsername: username,
    adminPassword: password,
    //customData: Buffer.from(initScript).toString("base64"),
    linuxConfiguration: {
      disablePasswordAuthentication: false,
    },
  },
  storageProfile: {
    osDisk: {
      createOption: compute.DiskCreateOption.FromImage,
      name: "myosdisk1",
    },
    imageReference: {
      publisher: "canonical",
      offer: "UbuntuServer",
      sku: "16.04-LTS",
      version: "latest",
    },
  },
});

// The public IP address is not allocated until the VM is running.
// Wait for that resource to create, then lookup the IP address
const done = pulumi.all ({
  _: vm.id, 
  name: publicIp.name, 
  resourceGroupName: resourceGroup.name
});

export const ipAddress = done.apply(async(d) => {
  return network.getPublicIPAddress({
    resourceGroupName: d.resourceGroupName,
    publicIpAddressName: d.name,
  }).then(ip => ip.ipAddress);
});