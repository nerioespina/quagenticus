package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println("qgctl - Quagenticus CLI")
	if len(os.Args) > 1 {
		fmt.Printf("Command: %s\n", os.Args[1])
	}
}
